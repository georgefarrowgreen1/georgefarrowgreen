// Today's page (the inflite repo's today/public, where it's checked out beside this one), as One roof builds on it:
// nothing it draws has an inline style or an inline script, which its CSP refuses; and its page is InFlite's one page
// (the hub's marker, the views and the tab bar, the day's stylesheet, the way in). Moved unchanged from
// todayfiles.test.mjs by B0; TD brings it up to the framework's page (spec §9.4 TD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const PUB = new URL('../../../../inflite/today/public/', import.meta.url);
const skip = !existsSync(new URL('index.html', PUB)) && 'the inflite repo isn’t beside this one';
// (InFlite's page's cases: skipped, not failed, where the inflite repo beside has no hub yet, as its live branch beside
// main while this repo goes live first)
const tfSkip = skip || (!existsSync(new URL('../../../../inflite/today/src/hub.js', import.meta.url)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
const pub = (f) => readFileSync(new URL(f, PUB));

test('nothing Today draws has an inline style or an inline script, which its CSP refuses', { skip: tfSkip }, () => {
  for (const f of ['index.html', '404.html']) {
    const html = String(pub(f));
    assert.ok(!/\sstyle\s*=/.test(html), `${f} has a style attribute`);
    assert.ok(!/<style\b/.test(html), `${f} has a <style>`);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) assert.match(tag, /\ssrc=/, `${f}: an inline script`);
    assert.ok(!/\son[a-z]+\s*=/.test(html), `${f} has an inline handler`);
  }
  for (const f of ['app.js', 'cards.js', 'day.js', 'apps.js', 'you.js']) {
    // (InFlite's shared menu sets its place with the CSSOM, which the CSP allows: only style="" in markup is refused)
    const js = String(pub(f));
    assert.ok(!/style=\\?["']/.test(js), `${f} writes a style attribute into markup`);
    assert.ok(!/setAttribute\(\s*["']style["']/.test(js), `${f} sets a style attribute`);
    assert.ok(!/\son[a-z]+=\\?["']/.test(js), `${f} writes an inline handler into markup`);
  }
});

test('its page is InFlite’s one page: the hub’s marker, the views and the tab bar, the day’s stylesheet, and the way in', { skip: tfSkip }, () => {
  const html = String(pub('index.html'));
  assert.match(html, /<head>\s*<meta charset="utf-8">\s*<meta name="ifl-hub" content="\/">/, 'the marker that says it’s the hub, first after its charset');
  assert.match(html, /<link rel="stylesheet" href="\/day\.css">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="InFlite">/);
  // (#in: the header, #views (#today, #apps, #you) and the tab bar; #today: its top card, Waiting, Coming Up, the rest)
  const inner = html.slice(html.indexOf('<div class="today-in"'), html.indexOf('<!-- Morning'));
  const ids = [...inner.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['in', 'hd', 'views', 'today', 'kept', 'top', 'waiting', 'coming', 'rest', 'apps', 'you', 'tabs']);
  assert.match(inner, /<nav class="ifl-tabs" id="tabs" aria-label="InFlite"><\/nav>/);
  assert.match(inner, /<main id="apps" class="view" aria-label="Apps" hidden>/);
  assert.match(inner, /<main id="you" class="view" aria-label="You" hidden>/);
  // (Today never has a box to type in)
  const today = inner.slice(inner.indexOf('id="today"'), inner.indexOf('id="apps"'));
  assert.ok(!/<(input|textarea|select)\b/.test(today), 'nothing to type in on Today');
  // (the way in: Sign in, Chats' trip where the hub serves it, and quietly, Today's own)
  assert.match(html, /id="signinToday"[^>]*>Sign In Without Chats</);
});
