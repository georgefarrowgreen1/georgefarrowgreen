// Mail's copy of InFlite's way in (the inflite repo's email/public/app.css, where it's checked out beside this one): the
// template's, as every app here has it (unit/iflsignin.test.mjs checks those), and InFlite's mark the same. Refreshed by
// node .tools/signin.mjs ../inflite/email/public
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { START, END, block } from '../../signin.mjs';

const PUB = new URL('../../../../inflite/email/public/', import.meta.url);
const skip = !existsSync(new URL('app.css', PUB)) && 'the inflite repo isn’t beside this one';
const ROOT = new URL('../../../', import.meta.url);

test('Mail’s copy of InFlite’s way in is the template’s, and its mark the same', { skip }, () => {
  const css = readFileSync(new URL('app.css', PUB), 'utf8'), i = css.indexOf(START), j = css.indexOf(END);
  assert.ok(i >= 0 && j > i, 'Mail has no copy: run node .tools/signin.mjs ../inflite/email/public');
  assert.equal(css.slice(i, j + END.length), block(), 'Mail’s copy is out of date: run node .tools/signin.mjs ../inflite/email/public');
  assert.equal(readFileSync(new URL('inflite.svg', PUB), 'utf8'), readFileSync(new URL('.tools/inflite/inflite.svg', ROOT), 'utf8'), 'Mail’s inflite.svg differs');
});
