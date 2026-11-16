import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitSelectorList,hasScopedPrefix} from './fixtures/scoped-css.mjs';

const allowed=['.m-app','.ifl-sheet[data-app=app]','.ifl-sheet[data-app="app"]'];
test('selector lists split only top-level commas, preserving nested groups, quotes and escapes',()=>{
  const selectors=[
    '.m-app :is(.one, :not(.two, [data-label="a,b"]))',
    '.m-app [data-label=\'a,\\\'b\']',
    '.m-app .escaped\\,comma',
    '.m-app :nth-child(2n of :is(.one,.two))',
    '.m-app/* ignored comma, and (bracket] */ .last',
  ];
  assert.deepEqual(splitSelectorList(selectors.join(',\n')),selectors);
  assert.deepEqual(splitSelectorList(':is(.m-app, .ifl-sheet[data-app="app"]) > :is(button, input)'),[':is(.m-app, .ifl-sheet[data-app="app"]) > :is(button, input)']);
});
test('scope roots allow nested child groups and require every leading :is branch to be allowed',()=>{
  for(const selector of [
    '.m-app', '.m-app:hover', '.m-app:is(.one,.two)',
    '.m-app :is(button, input, :not(.first,.last))',
    '.m-app [data-label="a,b"]',
    '.ifl-sheet[data-app="app"] :is(input, textarea)',
    ':is(.m-app, .ifl-sheet[data-app=app]) > :is(button,input)',
    ':is(:is(.m-app,.ifl-sheet[data-app="app"]), .m-app .nested):hover',
  ]) assert.equal(hasScopedPrefix(selector,allowed),true,selector);
  for(const selector of [
    'body', 'html', ':root', '.foreign .m-app', '.m-app-other', '.m-app\\,foreign',
    ':is(.m-app, body)', ':is(.m-app, .foreign)', ':is(.m-app, [data-app=other])',
    ':is(.m-app, .ifl-sheet[data-app=foreign])',
    ':is(.m-app, :is(.m-app,.foreign))',
    ':not(.foreign) .m-app', '.m-app, .foreign',
  ]) assert.equal(hasScopedPrefix(selector,allowed),false,selector);
});
test('malformed selectors fail closed and explicit global selector rejection remains effective',()=>{
  for(const selector of ['.m-app,',':is(.m-app,.foreign','.m-app [name="a,b]','.m-app ]','.m-app/* unclosed'])assert.throws(()=>splitSelectorList(selector),SyntaxError,selector);
  const global=/(^|[\s,>+~(])(?::root|html|body)(?![\w-])/;
  for(const selector of ['.m-app :is(.child, body)',':is(.m-app, html)',':is(.m-app, :root)'])assert.equal(global.test(selector),true,selector);
  assert.equal(hasScopedPrefix('.m-app :is(.child, body)',allowed),true,'the independent global guard still rejects global selectors beneath a valid prefix');
});
