// The site's email (functions/_pigeon.js, functions/_account.js): each app from its own address on the one domain, under
// its own name, and the account's own look (its icon at the top, no site name; a way to the account at the foot)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailFrom, emailBody, sendEmail } from '../../../functions/_pigeon.js';
import { accountMail } from '../../../functions/_account.js';

test('each app from its own address on the site\'s domain, under its own name', () => {
  for (const from of ['InFlight <noreply@georgefarrowgreen.com>', 'noreply@georgefarrowgreen.com', ' noreply@georgefarrowgreen.com ']) {
    assert.equal(emailFrom({ PIGEON_FROM: from }), 'InFlight <inflight@georgefarrowgreen.com>', from);
    assert.equal(emailFrom({ PIGEON_FROM: from }, 'Account'), 'Account <account@georgefarrowgreen.com>', from);
  }
  assert.equal(emailFrom({ CONTACT_FROM: 'Website <noreply@georgefarrowgreen.com>' }, 'Account'), 'Account <account@georgefarrowgreen.com>', 'the contact form\'s domain, if that\'s the one set');
  assert.equal(emailFrom({}, 'Account'), 'Account <onboarding@resend.dev>', 'Resend\'s test sender until a domain\'s set up (the one address it allows)');
  assert.equal(emailFrom({ PIGEON_FROM: 'InFlight <onboarding@resend.dev>' }), 'InFlight <onboarding@resend.dev>');
});

test('the look: the email\'s tile with its app\'s icon as a badge, a pill, the details with a symbol each, each app in its colours', () => {
  const acct = emailBody({ title: 'A new sign-in', brand: 'account', icon: 'shield', pill: ['phone', 'iPhone · Safari'], lines: ['Someone just signed in to your account.', 'If it wasn’t you, change it.'],
    rows: [['Account', '@geo'], ['How', 'Password'], ['Something new', 'x']], button: { label: 'Review your account', url: 'https://account.georgefarrowgreen.com/' } }).html;
  const ifl = emailBody({ title: 'A pigeon landed', icon: 'landed', unsub: 'https://georgefarrowgreen.com/u' }).html;
  // (nothing above the card: the tile and badge are one picture, in the app's own set)
  assert.match(acct, /<td class="ml-card"[^>]*>\s*<!--[^>]*-->\s*<img src="https:\/\/georgefarrowgreen\.com\/pigeon\/mail\/v2\/account-shield\.png" width="112" height="112" alt="Account"/);
  assert.match(ifl, /pigeon\/mail\/v2\/inflight-landed\.png" width="112" height="112" alt="InFlight"/);
  assert.match(emailBody({ title: 'x', brand: 'account', icon: 'landed' }).html, /v2\/account-shield\.png/, 'a tile the app hasn\'t: its own');
  assert.equal(acct.indexOf('<td class="ml-card"') < acct.indexOf('pigeon/mail/v2/'), true);
  assert.doesNotMatch(acct.slice(0, acct.indexOf('<td class="ml-card"')).replace(/<style>[\s\S]*<\/style>|<title>[^<]*<\/title>|<[^>]+>/g, ''), /\S/, 'no words above the card');
  assert.match(acct, /class="ml-pill"[^>]*>.*g-account-phone\.png.*iPhone · Safari<\/span>/);
  for (const [k, sym] of [['Account', 'person'], ['How', 'key'], ['Something new', 'dot']]) assert.match(acct, new RegExp(`g-account-${sym}\\.png[\\s\\S]{0,400}>${k}</td>`), k);
  assert.match(acct, /class="ml-p1"[^>]*>Someone just signed in to your\u00a0account\.<\/p>/, 'what happened, its last two words together');
  assert.match(acct, /class="ml-p2"[^>]*>If it wasn’t you, change\u00a0it\.<\/p>/, 'then, quieter, what to do');
  assert.match(acct, /bgcolor="#4a45dc" style="background-color:#4a45dc;background-image:linear-gradient\(180deg,#7d8aff,#4a45dc\)/, 'the account\'s indigo (flat where gradients aren\'t shown)');
  assert.match(ifl, /a\{color:#0a6ef0\}/, 'InFlight\'s blue');
  assert.match(acct, /About your georgefarrowgreen\.com account<br><a class="ml-a" href="https:\/\/account\.georgefarrowgreen\.com\/"[^>]*>Manage your account<\/a>/, 'the account, at the foot');
  assert.match(ifl, /<a class="ml-a" href="https:\/\/georgefarrowgreen\.com\/u"[^>]*>Turn these emails off<\/a>/);
  assert.doesNotMatch(ifl, /Manage your account/);
  assert.match(acct, /@media \(prefers-color-scheme:dark\)\{[\s\S]*\.ml-card\{background:#16182b!important/, 'a dark version, in the app\'s night sky');
});

test('the account\'s emails are sent from "Account"; InFlight\'s from "InFlight"', async () => {
  const sent = [], was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  try {
    const env = { RESEND_API_KEY: 'k', PIGEON_FROM: 'InFlight <noreply@georgefarrowgreen.com>' };
    const u = { name: 'Rowan Hale', handle: 'rowan', email: 'rowan@example.com', email_ok: 1 };
    assert.equal(await accountMail(env, u, { title: 'Your password was changed', subject: 'Your password was changed', line: 'it was.' }), true);
    assert.equal(await accountMail(env, { ...u, email_ok: 0 }, { title: 'x', subject: 'x', line: 'x' }), false, 'nothing to an email not yet confirmed');
    await sendEmail(env, { to: u.email, subject: 'A pigeon landed', text: 't', html: 'h' });
    assert.deepEqual(sent.map((s) => s.from), ['Account <account@georgefarrowgreen.com>', 'InFlight <inflight@georgefarrowgreen.com>']);
    assert.match(sent[0].text, /^Your password was changed\n\nHi Rowan, it was\./);
  } finally { globalThis.fetch = was; }
});
