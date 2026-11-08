import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../../', import.meta.url);
const source = readFileSync(new URL('.tools/inflite/zoom.js', root), 'utf8').trim();

test('page zoom guard cancels pinch gestures once and permits single-finger scrolling', () => {
  const listeners = new Map();
  const context = vm.createContext({ document: { addEventListener(type, fn, options) {
    assert.equal(options.passive, false);
    const entries = listeners.get(type) || []; entries.push(fn); listeners.set(type, entries);
  } } });
  vm.runInContext(source, context); vm.runInContext(source, context);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'touchmove']) assert.equal(listeners.get(type).length, 1);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    let cancelled = false; listeners.get(type)[0]({ preventDefault() { cancelled = true; } }); assert.equal(cancelled, true);
  }
  for (const fingers of [1, 2]) {
    let cancelled = false;
    listeners.get('touchmove')[0]({ touches: Array(fingers).fill({}), preventDefault() { cancelled = true; } });
    assert.equal(cancelled, fingers > 1);
  }
});

test('every app and sign-in entry carries the same early zoom guard', () => {
  for (const path of ['account/theme.js', 'pigeon/theme.js', 'weather/early.js', 'fitness/theme.js', 'markets/theme.js',
    'status/app.js', 'pigeon/tracker.js', 'fitness/routes-preview.js']) {
    assert.ok(readFileSync(new URL(path, root), 'utf8').includes(source), path);
  }
  for (const path of ['today/public/theme.js', 'email/public/theme.js', 'email/public/body/body.js']) {
    const file = new URL('../inflite/' + path, root);
    if (existsSync(file)) assert.ok(readFileSync(file, 'utf8').includes(source), path);
  }
});
