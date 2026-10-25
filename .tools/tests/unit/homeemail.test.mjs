// The home page's Get in touch (app.js EMAIL): what it takes for an email is exactly what the server takes
// (functions/_pigeon.js EMAIL_RE, which functions/api/contact.js checks), so an address the page folds into the From
// row and sends is never refused there with a message that blames every field and marks none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { EMAIL_RE } from '../../../functions/_pigeon.js';

const src = readFileSync(new URL('../../../app.js', import.meta.url), 'utf8');
const m = /^const EMAIL = \/(.+)\/;$/m.exec(src);

test('the page’s email pattern is the server’s', () => {
  assert.ok(m, 'app.js has its EMAIL');
  assert.equal(m[1], EMAIL_RE.source);
});
test('so the slips the server refuses are said on the page, at the field', () => {
  const page = new RegExp(m[1]);
  for (const e of ['name@gmail.com.', 'ann@gmail.com,', 'ann@gmail..com', 'a@b.c', 'josé@example.com', 'jo@münchen.de', 'sam@example'])
    assert.equal(page.test(e), false, e);
  for (const e of ['sam@example.com', 'ann.o+news@mail.example.co.uk']) assert.equal(page.test(e), true, e);
});
