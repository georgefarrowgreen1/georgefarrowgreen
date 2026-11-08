// Today's copy of InFlite's way in (the inflite repo's today/public/app.css, where it's checked out beside this one): the
// template's, as every app here has it (unit/iflsignin.test.mjs checks those, mailsignin.test.mjs Mail's), and
// InFlite's mark the same. Refreshed by node .tools/signin.mjs ../inflite/today/public
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { START, END, block } from '../../signin.mjs';

const PUB = new URL('../../../../inflite/today/public/', import.meta.url);
const skip = !existsSync(new URL('app.css', PUB)) && 'the inflite repo isn’t beside this one';
const ROOT = new URL('../../../', import.meta.url);

test('Today’s copy of InFlite’s way in is the template’s, and its mark the same', { skip }, () => {
  const css = readFileSync(new URL('app.css', PUB), 'utf8'), i = css.indexOf(START), j = css.indexOf(END);
  assert.ok(i >= 0 && j > i, 'Today has no copy: run node .tools/signin.mjs ../inflite/today/public');
  assert.equal(css.slice(i, j + END.length), block(), 'Today’s copy is out of date: run node .tools/signin.mjs ../inflite/today/public');
  assert.equal(css.indexOf(START, i + 1), -1, 'one copy only');
  assert.equal(readFileSync(new URL('inflite.svg', PUB), 'utf8'), readFileSync(new URL('.tools/inflite/inflite.svg', ROOT), 'utf8'), 'Today’s inflite.svg differs');
});

test('Today’s way in is the shared one: its parts by the shared names, in index.html, there without a script', { skip }, () => {
  const html = readFileSync(new URL('index.html', PUB), 'utf8');
  for (const c of ['ifl-in', 'ifl-top', 'ifl-logo', 'ifl-cta', 'ifl-brand', 'ifl-go', 'ifl-new']) assert.match(html, new RegExp(`class="[^"]*\\b${c}\\b`), c);
  assert.doesNotMatch(html, /class="[^"]*\b(?:ifl-title|ifl-tagline)\b/, "minimal branded welcome has no title or tagline");
  assert.match(html, /<img src="\/inflite\.svg" alt="" width="22" height="22">Powered by InFlite/);
  assert.match(html, /id="signin" href="https:\/\/auth\.inflite\.ai\/">Sign in</);
});
