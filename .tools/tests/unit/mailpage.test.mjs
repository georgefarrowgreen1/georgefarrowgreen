// Mail's page (the inflite repo's email/public/app.js, where it's checked out beside this one): an email address in a
// message, or a mailto: link, writing a message in Mail rather than another app; a send that fails offering Try Again
// unless Mail refused it; and a row swiped all the way only well past its actions. Its own words, taken from the page.
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

test('a send that fails: Try Again, as the same message, wherever it may have gone; Edit only where Mail refused it, or it never left', { skip }, () => {
  // (what runSend makes of a failure, taken from it: Mail refused it (to be changed), and whether to ask again)
  const line = (k) => new RegExp(`\\n\\s+const ${k} = (.+);\\n`).exec(/async function runSend\(job[\s\S]*?\n {2}\}\n/.exec(src)?.[0] || '')?.[1] || assert.fail(`runSend: ${k}`);
  const choice = vm.runInNewContext(`(err) => { const refused = ${line('refused')}; const again = ${line('again')}; return again ? 'Try Again' : 'Edit'; }`, {});
  const said = (status) => choice(Object.assign(new Error('x'), status === undefined ? {} : { status }));
  // (no answer at all, Mail or the way to it failing, still sending it from the time before, or signed out)
  for (const status of [0, 500, 502, 503, 504, 401]) assert.equal(said(status), 'Try Again', status);
  // (refused: no one to send it to, an address that isn't one, too big; or a file of it that couldn't be read here)
  for (const status of [400, 403, 404, 413, undefined]) assert.equal(said(status), 'Edit', status);
});

test('a row swiped left: all the way always well past the actions it shows, and within reach on a narrow phone', { skip }, () => {
  const rightW = vm.runInNewContext(`${/\n {2}const rightW = (.+);\n/.exec(src)?.[1] || assert.fail('app.js: rightW')}`, {});
  const fullRight = vm.runInNewContext(`(rightW, LEFT_W) => (width) => { const fullAt = ${/\n\s+const fullAt = (.+);\n/.exec(src)?.[1] || assert.fail('app.js: fullAt')}; return fullRight; }`, {})(rightW, 88);
  for (const width of [320, 360, 375, 390, 414, 430, 744, 1024]) {
    const shown = rightW(width), all = -fullRight(width);
    assert.ok(all - shown >= 40, `${width}pt: all the way at ${all}pt, the actions ${shown}pt`);
    assert.ok(all <= width * 0.8, `${width}pt: all the way at ${all}pt, out of reach`);
    assert.ok(shown / 4 >= 52 && shown <= 4 * 72, `${width}pt: each action ${shown / 4}pt`);
  }
});
