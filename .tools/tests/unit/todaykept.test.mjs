// Signing out of InFlite at the hub (Today's signOut, the inflite repo's today/public/app.js) lets go of what each app
// keeps of you at this address, as each app's own Sign Out does (spec §11.5; review-am I2): its APP_KEPT must hold every
// key each app's own sign-out lists name. Read from the apps' sources here, so a key an app adds to its own Sign Out
// (Fitness's today-swaps did, after APP_KEPT was written) can't be missed at the hub: Markets' forget(), Fitness's
// signOutHere() and forgetCopies(), Weather's signedOut(), and Chat's forget() (its localStorage; its IndexedDB is
// Chat's engine's, or Today's fallback, which todayshell.mjs covers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const TODAY = new URL('../inflite/today/public/app.js', root);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const todaySrc = existsSync(TODAY) ? readFileSync(TODAY, 'utf8') : '';
// (skipped, not failed, where the inflite repo beside isn't there or is from before Today First: its live branch, as CI
// has it beside main while this repo goes live first)
const skip = !todaySrc ? 'the inflite repo isn’t beside this one' : !/const APP_KEPT = \[/.test(todaySrc) && 'the inflite repo beside has no APP_KEPT (from before Today First)';

// (a function's body, from its line to the first line that closes it at the start)
function body(src, head) {
  const i = src.indexOf(head);
  assert.ok(i >= 0, `${head} is there`);
  const end = src.indexOf('\n}', i);
  return src.slice(i, end < 0 ? undefined : end);
}
const strings = (s) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
// (the keys in a `for (const k of [ … ]) store.<verb>(k…)` loop)
const loopKeys = (s, verb) => [...s.matchAll(new RegExp(String.raw`for \(const k of \[([^\]]*)\]\) store\.${verb}\(k`, 'g'))].flatMap((m) => strings(m[1]));
// (the keys in each store.set("k", null) and store.del("k"))
const callKeys = (s) => [...s.matchAll(/store\.(?:set\("([^"]+)", null\)|del\("([^"]+)"\))/g)].map((m) => m[1] || m[2]);

const kept = () => strings(todaySrc.match(/const APP_KEPT = \[([\s\S]*?)\];/)[1]);
const missing = (keys) => keys.filter((k) => !kept().includes(k));

test('Markets’ own Sign Out (forget) lets go of keys APP_KEPT has, each one', { skip }, () => {
  const keys = loopKeys(body(read('markets/app.js'), '\nfunction forget() {'), 'del').map((k) => `markets:${k}`);
  assert.ok(keys.includes('markets:last'), `read Markets’ list: ${keys}`);
  assert.deepEqual(missing(keys), []);
});

test('Fitness’s own Sign Out (signOutHere, forgetCopies) lets go of keys APP_KEPT has, each one', { skip }, () => {
  const src = read('fitness/app.js');
  const keys = [...new Set([...callKeys(body(src, '\nasync function signOutHere(')), ...loopKeys(body(src, '\nfunction forgetCopies() {'), 'set')])].map((k) => `fitness:${k}`);
  assert.ok(keys.includes('fitness:hk') && keys.includes('fitness:meAt'), `read Fitness’s lists: ${keys}`);
  assert.deepEqual(missing(keys), []);
});

test('Weather’s own Sign Out (signedOut) lets go of keys APP_KEPT has, each one', { skip }, () => {
  const keys = callKeys(body(read('weather/app.js'), '\nfunction signedOut() {'));
  assert.ok(keys.includes('wx:acct'), `read Weather’s list: ${keys}`);
  assert.deepEqual(missing(keys), []);
});

test('Chat’s own Sign Out (forget) lets go of localStorage keys APP_KEPT has, each one', { skip }, () => {
  const src = read('pigeon/app.js');
  const consts = Object.fromEntries([...src.matchAll(/(?:const|,) ([A-Z_]+_KEY) = "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const keys = [...body(src, '\nasync function forget(').matchAll(/localStorage\.removeItem\(([A-Z_]+|"[^"]+")\)/g)].map((m) => (m[1].startsWith('"') ? m[1].slice(1, -1) : consts[m[1]]));
  assert.ok(keys.length >= 4 && keys.every(Boolean), `read Chat’s list: ${keys}`);
  assert.deepEqual(missing(keys), []);
});

test('APP_KEPT holds only the apps’ copies of you: never the phone’s own (Weather’s places and settings, each app’s look), nor Today’s', { skip }, () => {
  const k = kept();
  for (const own of ['wx:places', 'wx:settings', 'markets:appearance', 'fitness:appearance', 'inflight-theme']) assert.ok(!k.includes(own), own);
  assert.ok(k.every((x) => !x.startsWith('today:')), 'nothing of Today’s own');
});
