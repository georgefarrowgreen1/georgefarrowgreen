// Mail's page (the inflite repo's email/public/app.js, where it's checked out beside this one): an email address in a
// message, or a mailto: link, writing a message in Mail rather than another app. Its own words, taken from the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = new URL('../../../../inflite/email/public/app.js', import.meta.url);
const skip = !existsSync(APP) && 'the inflite repo isn’t beside this one';
const src = skip ? '' : readFileSync(APP, 'utf8');
const fn = (name) => new RegExp(`\\n {2}function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}\\n`).exec(src)?.[0] || assert.fail(`app.js: ${name}`);
const page = () => vm.runInNewContext(`${fn('parseAddress')}; const EMAIL_RE = ${/\n {2}const EMAIL_RE = (.+);\n/.exec(src)[1]}; ${fn('mailtoDraft')}; ${fn('linkify')};
  ({ mailtoDraft, linkify })`, {});

test('a mailto: link as a message to write: who to, cc and bcc, its subject and its words (a "+" a plus)', { skip }, () => {
  const { mailtoDraft } = page();
  const d = mailtoDraft('mailto:help@example.com,Rowan%20%3Crowan+news@example.com%3E?subject=Order%20%23123&body=Hello%2C%0D%0Aa+b&cc=maya@example.com&bcc=x@example.com');
  assert.deepEqual(JSON.parse(JSON.stringify(d)), {
    to: [{ name: '', email: 'help@example.com' }, { name: 'Rowan', email: 'rowan+news@example.com' }],
    cc: [{ name: '', email: 'maya@example.com' }],
    bcc: [{ name: '', email: 'x@example.com' }],
    subject: 'Order #123',
    text: 'Hello,\na+b',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(mailtoDraft('MAILTO:?to=a@example.com&subject=Hi'))).to, [{ name: '', email: 'a@example.com' }], 'no one before the ?, any case');
  assert.equal(mailtoDraft('mailto:not-an-address').to.length, 0, 'what isn’t an address left out');
  assert.equal(mailtoDraft('mailto:a@example.com?subject=%E0%A4%A').subject, '%E0%A4%A', 'badly encoded: as it was');
  assert.equal(mailtoDraft('https://example.com/'), null);
  assert.equal(mailtoDraft(null), null);
});

test('a message’s text: web addresses linked as before, email addresses as mailto: (not inside a web address)', { skip }, () => {
  const { linkify } = page();
  assert.equal(linkify('Write to help@example.co.uk.'), 'Write to <a href="mailto:help@example.co.uk">help@example.co.uk</a>.');
  assert.equal(linkify('Rowan &lt;rowan@example.com&gt; wrote:'), 'Rowan &lt;<a href="mailto:rowan@example.com">rowan@example.com</a>&gt; wrote:');
  assert.equal(linkify('See https://x.com/u?e=a@b.com today'), 'See <a href="https://x.com/u?e=a@b.com" target="_blank" rel="noopener noreferrer">https://x.com/u?e=a@b.com</a> today');
  assert.equal(linkify('at me@localhost or @handle'), 'at me@localhost or @handle', 'not an address anywhere: as it is');
});

test('a tap on an email address, in a message’s frame or its text, writes the message here', { skip }, () => {
  assert.match(src, /function mailtoHere\(e\) \{[\s\S]*?mailtoDraft\(a\.getAttribute\("href"\)\)[\s\S]*?e\.preventDefault\(\);[\s\S]*?openCompose\(draft\)/);
  assert.match(src, /d\.addEventListener\("click", mailtoHere\)/, 'in a message’s own frame');
  assert.match(src, /document\.addEventListener\("click", mailtoHere\)/, 'and in a message shown as text');
});
