import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { TARGETS, block } from '../../motion.mjs';

const root = new URL('../../../', import.meta.url);
const source = readFileSync(new URL('.tools/inflite/motion.js', root), 'utf8');

test('shared presentation motion pauses once while hidden and resumes after browser restoration', () => {
  const docEvents = new Map(), windowEvents = new Map(), attrs = new Set();
  const record = (map) => (name, fn) => { const entries = map.get(name) || []; entries.push(fn); map.set(name, entries); };
  const document = { visibilityState: 'visible', documentElement: { toggleAttribute(name, on) { if (on) attrs.add(name); else attrs.delete(name); } }, addEventListener: record(docEvents) };
  const context = vm.createContext({ document, addEventListener: record(windowEvents) });
  vm.runInContext(source, context); vm.runInContext(source, context);
  assert.equal(docEvents.get('visibilitychange').length, 1);
  assert.equal(windowEvents.get('pagehide').length, 1);
  assert.equal(windowEvents.get('pageshow').length, 1);
  assert.equal(attrs.has('data-motion-paused'), false);
  document.visibilityState = 'hidden'; docEvents.get('visibilitychange')[0]();
  assert.equal(attrs.has('data-motion-paused'), true);
  document.visibilityState = 'visible'; windowEvents.get('pageshow')[0]();
  assert.equal(attrs.has('data-motion-paused'), false);
  windowEvents.get('pagehide')[0]();
  assert.equal(attrs.has('data-motion-paused'), true);
  windowEvents.get('pageshow')[0]();
  assert.equal(attrs.has('data-motion-paused'), false);
});

test('presentation motion is an optional enhancement in non-browser renderers', () => {
  for (const context of [{}, { document: {} }, { document: { documentElement: {} } }]) assert.doesNotThrow(() => vm.runInNewContext(source, context));
});

test('every app entry runs the same motion lifecycle without adding another request', () => {
  for (const path of TARGETS) {
    const file = new URL(path, root);
    if (!existsSync(file) && path.startsWith('../inflite/')) continue;
    assert.ok(readFileSync(file, 'utf8').includes(block().trim()), path);
  }
});
