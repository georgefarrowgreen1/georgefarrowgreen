// The site's email (functions/_pigeon.js, functions/_account.js): every app's from the one address, each under its own
// name, and the account's own look (its icon at the top, no site name; a way to the account at the foot)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailFrom, emailBody, sendEmail } from '../../../functions/_pigeon.js';
import { accountMail } from '../../../functions/_account.js';

test('one address, each app under its own name', () => {
  for (const from of ['InFlight <noreply@georgefarrowgreen.com>', 'noreply@georgefarrowgreen.com', ' noreply@georgefarrowgreen.com ']) {
    assert.equal(emailFrom({ PIGEON_FROM: from }), 'InFlight <noreply@georgefarrowgreen.com>', from);
    assert.equal(emailFrom({ PIGEON_FROM: from }, 'Account'), 'Account <noreply@georgefarrowgreen.com>', from);
  }
  assert.equal(emailFrom({ CONTACT_FROM: 'Website <noreply@georgefarrowgreen.com>' }, 'Account'), 'Account <noreply@georgefarrowgreen.com>', 'the contact form\'s address, if that\'s the one set');
  assert.equal(emailFrom({}, 'Account'), 'Account <onboarding@resend.dev>', 'Resend\'s test sender until a domain\'s set up');
});

test('the header: the app\'s icon only', () => {
  const acct = emailBody({ title: 'A new sign-in', brand: 'account' }).html, ifl = emailBody({ title: 'A pigeon landed' }).html;
  const head = (h) => h.slice(h.indexOf('<!-- whose it is'), h.indexOf('<tr><td class="ml-card"'));
  assert.match(head(acct), /account\.georgefarrowgreen\.com\/icon-180\.png\?v=2" width="52" height="52" alt="Account"/);
  assert.match(head(ifl), /\/pigeon\/icon-192\.png" width="52" height="52" alt="InFlight"/);
  for (const h of [head(acct), head(ifl)]) assert.doesNotMatch(h.replace(/<[^>]+>/g, ''), /\S/, 'no words in it');
  assert.match(acct, /About your georgefarrowgreen\.com account\. <a href="https:\/\/account\.georgefarrowgreen\.com\/"[^>]*>Manage your account<\/a>/, 'the account, at the foot');
  assert.doesNotMatch(ifl, /Manage your account/);
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
    assert.deepEqual(sent.map((s) => s.from), ['Account <noreply@georgefarrowgreen.com>', 'InFlight <noreply@georgefarrowgreen.com>']);
    assert.match(sent[0].text, /^Your password was changed\n\nHi Rowan, it was\./);
  } finally { globalThis.fetch = was; }
});
