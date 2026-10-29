// The site's email (functions/_email.js), every app's: each from its own address on the one domain, under its own
// name; one look, in each app's colours, with its own pictures (mail/); the account's way to it at the foot
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { BRANDS, emailFrom, emailBody, sendEmail } from '../../../functions/_email.js';
import { accountMail } from '../../../functions/_account.js';

const ROOT = new URL('../../../', import.meta.url).pathname;

test('each app from its own address: at inflite.ai by Cloudflare where that\'s set up, the home page\'s at georgefarrowgreen.com', () => {
  const CF = { CF_EMAIL_TOKEN: 't', CF_ACCOUNT_ID: 'a' };
  for (const from of ['Chat <noreply@georgefarrowgreen.com>', 'noreply@georgefarrowgreen.com', ' noreply@georgefarrowgreen.com ']) {
    assert.equal(emailFrom({ PIGEON_FROM: from, ...CF }, 'inflight'), 'Chat <chat@inflite.ai>', from);
    assert.equal(emailFrom({ PIGEON_FROM: from, ...CF }, 'account'), 'Account <account@inflite.ai>', from);
    assert.equal(emailFrom({ PIGEON_FROM: from }, 'account'), 'Account <account@georgefarrowgreen.com>', 'without Cloudflare: by Resend, from its domain, as before');
  }
  assert.equal(emailFrom({ PIGEON_FROM: 'noreply@georgefarrowgreen.com', ...CF }, 'weather'), 'Weather <weather@inflite.ai>');
  assert.equal(emailFrom({ PIGEON_FROM: 'noreply@georgefarrowgreen.com', ...CF }, 'website'), 'Website <website@georgefarrowgreen.com>', 'the bio site\'s own, from its own domain');
  assert.equal(emailFrom({ PIGEON_FROM: 'noreply@georgefarrowgreen.com', CONTACT_FROM: 'Website <noreply@gfg.example>' }, 'website'), 'Website <website@gfg.example>', 'the contact form\'s domain, where it has one of its own');
  assert.equal(emailFrom({ CONTACT_FROM: 'Website <noreply@georgefarrowgreen.com>' }, 'account'), 'Account <account@georgefarrowgreen.com>');
  assert.equal(emailFrom({ ...CF, APPS_MAIL_DOMAIN: 'mail.example.com' }, 'account'), 'Account <account@mail.example.com>', 'APPS_MAIL_DOMAIN, to say otherwise');
  assert.equal(emailFrom({}, 'account'), 'Account <onboarding@resend.dev>', 'Resend\'s test sender until a domain\'s set up (the one address it allows)');
  assert.equal(emailFrom({ PIGEON_FROM: 'Chat <onboarding@resend.dev>' }, 'inflight'), 'Chat <onboarding@resend.dev>');
  assert.throws(() => emailFrom({}, 'nobody'), /No email brand "nobody"/, 'an app that isn\'t a brand doesn\'t send');
});
test('by Cloudflare: its API, the sender named, a reply-to and the unsubscribe headers; a refusal or a bounce is a failure', async () => {
  const sent = [], was = globalThis.fetch;
  let answer = { success: true, errors: [], result: { delivered: ['rowan@example.com'], permanent_bounces: [], queued: [] } };
  globalThis.fetch = async (url, init) => { sent.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) }); return new Response(JSON.stringify(answer), { status: answer.success ? 200 : 403 }); };
  try {
    const env = { RESEND_API_KEY: 'k', PIGEON_FROM: 'noreply@georgefarrowgreen.com', CF_EMAIL_TOKEN: 'cft', CF_ACCOUNT_ID: 'acc' };
    await sendEmail(env, { brand: 'account', to: 'rowan@example.com', replyTo: 'help@example.com', subject: 'S', text: 't', html: 'h', headers: { 'List-Unsubscribe': '<https://x/>' } });
    assert.equal(sent[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/email/sending/send');
    assert.equal(sent[0].auth, 'Bearer cft');
    assert.deepEqual(sent[0].body.from, { address: 'account@inflite.ai', name: 'Account' });
    assert.equal(sent[0].body.reply_to, 'help@example.com'); assert.equal(sent[0].body.headers['List-Unsubscribe'], '<https://x/>');
    await sendEmail(env, { brand: 'website', to: 'me@example.com', subject: 'S', text: 't', html: 'h' });
    assert.equal(sent[1].url, 'https://api.resend.com/emails', 'the home page\'s still by Resend');
    assert.equal(sent[1].body.from, 'Website <website@georgefarrowgreen.com>');
    answer = { success: true, errors: [], result: { delivered: [], permanent_bounces: ['x@example.com'], queued: [] } };
    await assert.rejects(sendEmail(env, { brand: 'inflight', to: 'x@example.com', subject: 'S', text: 't', html: 'h' }, { explain: true }), /Cloudflare refused the email: The address bounced/);
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

test('the look: the email\'s tile with its app\'s icon as a badge, a pill, the details with a symbol each, each app in its colours', () => {
  const acct = emailBody({ title: 'A new sign-in', brand: 'account', icon: 'shield', pill: ['phone', 'iPhone · Safari'], lines: ['Someone just signed in to your account.', 'If it wasn’t you, change it.'],
    rows: [['Account', '@geo'], ['How', 'Password'], ['Something new', 'x'], ['Its own', 'y', 'star']], button: { label: 'Review your account', url: 'https://account.georgefarrowgreen.com/' } }).html;
  const ifl = emailBody({ title: 'A pigeon landed', brand: 'inflight', icon: 'landed', unsub: 'https://georgefarrowgreen.com/u' }).html;
  // (nothing above the card: the tile and badge are one picture, in the app's own set)
  assert.match(acct, /<td class="ml-card"[^>]*>\s*<!--[^>]*-->\s*<img class="ml-tile" src="https:\/\/account\.inflite\.ai\/mail\/account-shield\.png" width="112" height="112" alt="Account"/);
  assert.match(ifl, /\/mail\/inflight-landed\.png" width="112" height="112" alt="Chat"/);
  assert.match(emailBody({ title: 'x', brand: 'account', icon: 'landed' }).html, /\/mail\/account-shield\.png/, 'a tile the app hasn\'t: its own');
  assert.doesNotMatch(acct.slice(0, acct.indexOf('<td class="ml-card"')).replace(/<style>[\s\S]*<\/style>|<title>[^<]*<\/title>|<[^>]+>/g, ''), /\S/, 'no words above the card');
  assert.match(acct, /class="ml-pill"[^>]*>.*g-account-phone\.png.*iPhone · Safari<\/span>/);
  for (const [k, sym] of [['Account', 'person'], ['How', 'key'], ['Something new', 'dot'], ['Its own', 'star']]) assert.match(acct, new RegExp(`g-account-${sym}\\.png[\\s\\S]{0,400}>${k}</td>`), k);
  assert.match(acct, /class="ml-p1"[^>]*>Someone just signed in to your account\.<\/p>/, 'what happened, its last two words together');
  assert.match(acct, /class="ml-p2"[^>]*>If it wasn’t you, change it\.<\/p>/, 'then, quieter, what to do');
  assert.match(acct, /bgcolor="#4a45dc" style="background-color:#4a45dc;background-image:linear-gradient\(180deg,#7d8aff,#4a45dc\)/, 'the account\'s indigo (flat where gradients aren\'t shown)');
  assert.match(acct, /Paste this link into your browser:<br><a class="ml-a" href="https:\/\/account\.georgefarrowgreen\.com\/"/, 'a web link, its address under the button');
  assert.match(ifl, /a\{color:#0a6ef0\}/, 'Chat\'s blue');
  assert.match(acct, /About your inflite\.ai account<br><a class="ml-a" href="https:\/\/account\.inflite\.ai\/"[^>]*>Manage your account<\/a>/, 'the account, at the foot');
  assert.match(ifl, /<a class="ml-a" href="https:\/\/georgefarrowgreen\.com\/u"[^>]*>Turn these emails off<\/a>/);
  assert.doesNotMatch(ifl, /Manage your account/);
  assert.match(acct, /@media \(prefers-color-scheme:dark\)\{[\s\S]*\.ml-card\{background:#16182b!important/, 'a dark version, in the app\'s night sky');
  assert.throws(() => emailBody({ title: 'x', brand: 'nobody' }), /No email brand/);
});

test('every app has the look: Weather, and the site\'s own page (its contact form, someone\'s words as they wrote them)', () => {
  const wx = emailBody({ title: 'Rain this afternoon', brand: 'weather', lines: ['x'], button: { label: 'Open Weather', url: 'https://weather.georgefarrowgreen.com/' } }).html;
  assert.match(wx, /\/mail\/weather-sky\.png" width="112" height="112" alt="Weather"/);
  assert.match(wx, /linear-gradient\(180deg,#5aa0fa,#2b69de\)/);
  assert.doesNotMatch(wx, /Manage your account|Chat/);
  const site = emailBody({ title: 'A message from Rowan Hale', brand: 'website', pill: ['mail', 'rowan@example.com'], quote: 'Hello <there>,\n\nA second paragraph.',
    rows: [['Sent', '23 Oct 2026, 10:11']], button: { label: 'Reply to Rowan', url: 'mailto:rowan@example.com?subject=Re%3A%20your%20message' } });
  assert.match(site.html, /\/mail\/website-mail\.png" width="112" height="112" alt="Website"/);
  assert.match(site.html, /white-space:pre-wrap[^>]*>Hello &lt;there&gt;,\n\nA second paragraph\.<\/div>/, 'their words, escaped, their lines kept');
  assert.match(site.html, /href="mailto:rowan@example\.com\?subject=Re%3A%20your%20message"/);
  assert.doesNotMatch(site.html, /Paste this link/, 'no address to paste for an email link');
  assert.match(site.html, /From the contact form on georgefarrowgreen\.com/);
  assert.match(site.text, /^A message from Rowan Hale\n\nrowan@example\.com\n\nHello <there>,\n\nA second paragraph\.\n\nSent: 23 Oct 2026, 10:11/);
});

test('the account\'s emails are sent from "Account"; Chat\'s from "Chat"; a reply goes where it\'s asked', async () => {
  const sent = [], was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  try {
    const env = { RESEND_API_KEY: 'k', PIGEON_FROM: 'Chat <noreply@georgefarrowgreen.com>' };
    const u = { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', email_ok: 1 };
    assert.equal(await accountMail(env, u, { title: 'Your password was changed', subject: 'Your password was changed', line: 'it was.' }), true);
    assert.equal(await accountMail(env, { ...u, email_ok: 0 }, { title: 'x', subject: 'x', line: 'x' }), false, 'nothing to an email not yet confirmed');
    await sendEmail(env, { brand: 'inflight', to: u.email, subject: 'A pigeon landed', text: 't', html: 'h' });
    await sendEmail(env, { brand: 'website', to: 'me@example.com', replyTo: u.email, subject: 'A message', text: 't', html: 'h' });
    assert.deepEqual(sent.map((s) => s.from), ['Account <account@georgefarrowgreen.com>', 'Chat <chat@georgefarrowgreen.com>', 'Website <website@georgefarrowgreen.com>']);
    assert.equal(sent[2].reply_to, 'rowan@example.com');
    assert.equal('reply_to' in sent[1], false);
    assert.match(sent[0].text, /^Your password was changed\n\nHi Rowan, it was\./);
    assert.match(sent[0].text, /About your inflite\.ai account\nManage your account: https:\/\/account\.inflite\.ai\/$/);
  } finally { globalThis.fetch = was; }
});
test('an app\'s email is inflite.ai\'s throughout: its pictures from there; the home page\'s from its own site', () => {
  const app = emailBody({ brand: 'weather', title: 'Rain soon', lines: ['x'] }).html, home = emailBody({ brand: 'website', title: 'A message', lines: ['x'] }).html;
  assert.ok(/src="https:\/\/account\.inflite\.ai\/mail\//.test(app) && !/georgefarrowgreen\.com\/mail\//.test(app), 'Weather\'s');
  assert.ok(/src="https:\/\/georgefarrowgreen\.com\/mail\//.test(home) && !/inflite\.ai\/mail\//.test(home), 'the contact form\'s');
});
