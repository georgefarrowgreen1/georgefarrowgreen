// One roof's router (the inflite repo's today/public/roof/router.js, where it's beside this one; spec §3.3, D6): every
// address of the framework read into its Route and written back, tab targets (/#you=<id>), a place and a section
// together, format's calls with no kind or a key of another section, and what's never the framework's: another origin,
// //x, a \ or a control character, a long path or hash (a long query is only dropped), and Weather's addresses with the
// roof off. Frozen by B0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOF, roofSkip } from './fixtures/roof.mjs';

const R = roofSkip ? null : await import(new URL('router.js', ROOF));
const skip = roofSkip;
const ORIGIN = 'https://inflite.ai';
const on = { roof: true, origin: ORIGIN }, off = { roof: false, origin: ORIGIN };
const tab = (t, arg = null) => ({ kind: 'tab', tab: t, arg });
const app = (section, key = section, arg = null, query = '') => ({ kind: 'app', app: 'weather', section, key, arg, query });

test('the registry and the tab bar: Weather’s paths, files, sections and aliases; the four tabs as the shared block has them', { skip }, () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY)), { weather: {
    app: 'weather', name: 'Weather', path: '/weather/', entry: '/weather/roof/weather.js', connector: '/weather/roof/connector.js',
    css: ['/weather/roof/weather.css', '/weather/roof/wxcore.css', '/weather/roof/wxsettings.css', '/weather/roof/radar.css'],
    sections: [['now', 'Now'], ['days', '16 Days'], ['radar', 'Radar'], ['warnings', 'Warnings']],
    aliases: { day: 'days', settings: 'now' } } });
  assert.deepEqual(JSON.parse(JSON.stringify(R.TABS)), { today: ['Today', '/', 'sun'], chats: ['Chats', '/chats/', 'bubble'], apps: ['Apps', '/#apps', 'grid'], you: ['You', '/#you', 'person'] });
  assert.ok(Object.isFrozen(R.REGISTRY) && Object.isFrozen(R.REGISTRY.weather) && Object.isFrozen(R.TABS), 'nobody changes them at run time');
});

test('the tabs: /, /index.html, #apps, #you and #you=<id>, anything else is Today; and back again', { skip }, () => {
  const cases = [
    ['/', tab('today'), '/'], ['/index.html', tab('today'), '/'], ['/#apps', tab('apps'), '/#apps'], ['/#you', tab('you'), '/#you'],
    ['/#you=notify', tab('you', 'notify'), '/#you=notify'], ['/#you=notify-weather', tab('you', 'notify-weather'), '/#you=notify-weather'],
    ['/#you=apps', tab('you', 'apps'), '/#you=apps'], ['/#you=quiet', tab('you', 'quiet'), '/#you=quiet'],
    ['/#you=rules', tab('you', 'rules'), '/#you=rules'], ['/#you=phone', tab('you', 'phone'), '/#you=phone'], ['/#you=account', tab('you', 'account'), '/#you=account'],
    // (app.js keeps handling these itself: to the router they're Today)
    ['/#morning', tab('today'), '/'], ['/#notify', tab('today'), '/'], ['/#signin=abc', tab('today'), '/'], ['/#go=%2Fweather%2F', tab('today'), '/'],
    ['/?x=1#apps', tab('apps'), '/#apps'], ['/index.html#you=apps', tab('you', 'apps'), '/#you=apps'],
    // (a target that isn't one: You, with none)
    ['/#you=', tab('you'), '/#you'], ['/#you=a%20b', tab('you'), '/#you'], ['/#you=' + 'x'.repeat(41), tab('you'), '/#you'], ['/#you=a.b', tab('you'), '/#you'],
    ['/#apps=x', tab('today'), '/'],
  ];
  for (const [href, route, back] of cases) {
    assert.deepEqual(R.parse(href, on), route, href);
    assert.deepEqual(R.parse(href, off), route, `${href}, roof off: tabs are still the framework's`);
    assert.equal(R.format(route), back, href);
    assert.deepEqual(R.parse(R.format(route), on), route, `${href} both ways`);
  }
  assert.equal(R.format(tab('today', 'x')), '/');
  assert.equal(R.format(tab('you', 'not ok')), '/#you');
});

test('Weather: Now, its sections, a day, Settings at a page, a place, and a place with a section; written back with no query', { skip }, () => {
  const q = '?lat=51.5&lon=-0.12&name=London';
  const cases = [
    ['/weather/', app('now'), '/weather/'], ['/weather/index.html', app('now'), '/weather/'],
    ['/weather/#now', app('now'), '/weather/'],
    ['/weather/#days', app('days'), '/weather/#days'], ['/weather/#radar', app('radar'), '/weather/#radar'], ['/weather/#warnings', app('warnings'), '/weather/#warnings'],
    ['/weather/#day=2026-11-03', app('days', 'day', '2026-11-03'), '/weather/#day=2026-11-03'],
    ['/weather/#settings', app('now', 'settings'), '/weather/#settings'], ['/weather/#settings=units', app('now', 'settings', 'units'), '/weather/#settings=units'],
    [`/weather/${q}`, app('now', 'now', null, q), '/weather/'],
    [`/weather/${q}#warnings`, app('warnings', 'warnings', null, q), '/weather/#warnings'],
    [`/weather/index.html${q}#radar`, app('radar', 'radar', null, q), '/weather/#radar'],
    // (a key that's no section nor alias: Now; a bad arg: dropped)
    ['/weather/#nope', app('now'), '/weather/'], ['/weather/#nope=1', app('now'), '/weather/'], ['/weather/#=x', app('now'), '/weather/'],
    ['/weather/#day=2026-11-03%3Cb%3E', app('days', 'day'), '/weather/#day'], ['/weather/#day=' + '1'.repeat(41), app('days', 'day'), '/weather/#day'],
    ['/weather/#day', app('days', 'day'), '/weather/#day'],
  ];
  for (const [href, route, back] of cases) {
    assert.deepEqual(R.parse(href, on), route, href);
    assert.equal(R.format(route), back, href);
    const again = R.parse(back, on);
    assert.equal(again.section, route.section, `${href} both ways`);
    assert.equal(R.format(again), back, `${back} is its own address`);
  }
  // (the tidy after a deep link: the section's own address, no query, no sheet key, D6)
  assert.equal(R.format({ kind: 'app', app: 'weather', section: 'days' }), '/weather/#days');
  assert.equal(R.format({ kind: 'app', app: 'weather', section: 'now' }), '/weather/');
  assert.equal(R.format({ kind: 'app', app: 'weather', section: 'warnings', query: q }), '/weather/#warnings', 'never a query');
  assert.equal(R.format({ kind: 'app', app: 'nope', section: 'now' }), '/');
  assert.equal(R.format(null), '/');
});

test('format: kind may be left out, and a key only counts when it belongs to the section (D6’s tidy, nav.section, nav.href, a spread route)', { skip }, () => {
  // (D6's own tidy call, with no kind: an app route because it has app; a tab route because it has tab)
  assert.equal(R.format({ app: 'weather', section: 'days' }), '/weather/#days');
  assert.equal(R.format({ app: 'weather', section: 'now' }), '/weather/');
  assert.equal(R.format({ app: 'nope', section: 'days' }), '/');
  assert.equal(R.format({ tab: 'you', arg: 'notify' }), '/#you=notify');
  assert.equal(R.format({ tab: 'apps' }), '/#apps');
  assert.equal(R.format({}), '/');
  // (a spread route whose section was changed: the old key, and its arg, are dropped)
  assert.equal(R.format({ ...R.parse('/weather/', on), section: 'radar' }), '/weather/#radar');
  assert.equal(R.format({ ...R.parse('/weather/#day=2026-11-03', on), section: 'radar' }), '/weather/#radar');
  assert.equal(R.format({ ...R.parse('/weather/#settings=units', on), section: 'warnings' }), '/weather/#warnings');
  assert.equal(R.format({ ...R.parse('/weather/#radar', on), section: 'now' }), '/weather/');
  assert.equal(R.format({ ...R.parse('/weather/#day=2026-11-03', on), section: 'days' }), '/weather/#day=2026-11-03', 'a key of the same section stays');
  // (fw.nav.section(id, { arg }) = format({ app, section: id, arg }); fw.nav.href(key, arg) = format({ app, key, arg }))
  assert.equal(R.format({ app: 'weather', section: 'radar', arg: null }), '/weather/#radar');
  assert.equal(R.format({ app: 'weather', section: 'days', arg: '2026-11-03' }), '/weather/#days=2026-11-03');
  assert.equal(R.format({ app: 'weather', key: 'day', arg: '2026-11-03' }), '/weather/#day=2026-11-03');
  assert.equal(R.format({ app: 'weather', key: 'settings', arg: 'units' }), '/weather/#settings=units');
  assert.equal(R.format({ app: 'weather', key: 'radar' }), '/weather/#radar');
  assert.equal(R.format({ app: 'weather', key: 'nope', arg: 'x' }), '/weather/', 'a key that’s no section nor alias: Now, its arg dropped');
  assert.equal(R.format({ app: 'weather', section: 'nope', key: 'warnings' }), '/weather/#warnings', 'a section that isn’t one: the key’s');
  assert.equal(R.format({ app: 'weather', section: 'radar', key: 'day', arg: '2026-11-03' }), '/weather/#radar');
});

test('a link’s own address (a.href) of this origin is read the same; another origin, //x, \\ and control characters are never ours', { skip }, () => {
  assert.deepEqual(R.parse(`${ORIGIN}/weather/#radar`, on), app('radar'));
  assert.deepEqual(R.parse(`${ORIGIN}/#you=apps`, on), tab('you', 'apps'));
  assert.deepEqual(R.parse('HTTPS://inflite.ai/#apps', on), tab('apps'));
  for (const href of ['https://weather.inflite.ai/', 'https://evil.example/weather/#radar', 'http://inflite.ai/', 'https://inflite.ai.evil.example/',
    '//inflite.ai/', '//x', '///x', '/\\x', '/weather/\\', '/\n/x', '/\t#apps', '/weather/#radar\u0000', '/\u007f', 'javascript:alert(1)',
    'data:text/html,x', 'weather/', '#apps', '', null, undefined, 42, {}, '/' + 'a'.repeat(2048)]) {
    assert.equal(R.parse(href, on), null, String(href));
    assert.equal(R.owns(href, on), false, String(href));
  }
  // (with no origin to compare, an absolute address is never ours)
  if (!globalThis.location) assert.equal(R.parse(`${ORIGIN}/#apps`, { roof: true }), null);
});

test('Weather’s query is passed on raw up to 400 characters, and dropped past that (the route kept)', { skip }, () => {
  const ok = '?name=' + 'a'.repeat(394), long = '?name=' + 'a'.repeat(395);
  assert.equal(ok.length, 400);
  assert.equal(R.parse(`/weather/${ok}#radar`, on).query, ok);
  assert.deepEqual(R.parse(`/weather/${long}#radar`, on), app('radar'));
  // (the 2048 cap is on the address less its query: a query of any length is dropped, the route kept, §3.3)
  const huge = '?name=' + 'a'.repeat(3000);
  assert.deepEqual(R.parse(`/weather/${huge}#radar`, on), app('radar'));
  assert.deepEqual(R.parse(`${ORIGIN}/weather/index.html${huge}#day=2026-11-03`, on), app('days', 'day', '2026-11-03'));
  assert.deepEqual(R.parse(`/${huge}#you=apps`, on), tab('you', 'apps'));
  assert.equal(R.parse('/weather/#radar' + 'a'.repeat(2048), on), null, 'a long hash is still too long');
  assert.equal(R.parse('/weather/#x?' + 'a'.repeat(2048), on), null, 'a ? after the # is the hash’s');
});

test('with the roof off (or the hub not ready) Weather’s addresses aren’t the framework’s, nor anything else of the site’s', { skip }, () => {
  for (const href of ['/weather/', '/weather/#radar', '/weather/?lat=1&lon=2&name=X#warnings', '/weather/index.html', `${ORIGIN}/weather/#days`]) {
    assert.equal(R.parse(href, off), null, href);
    assert.equal(R.owns(href, off), false, href);
    assert.equal(R.parse(href, { origin: ORIGIN }), null, `${href}: roof defaults to off`);
    assert.equal(R.owns(href, on), true, href);
  }
  for (const href of ['/weather', '/weather/radar', '/weather/app.js', '/weather/roof/weather.js', '/Weather/', '/chats/', '/chats/#open=1', '/fitness/', '/markets/', '/mail/', '/api/hub', '/x/']) {
    assert.equal(R.parse(href, on), null, href);
    assert.equal(R.owns(href, on), false, href);
  }
});

test('ownPath is the shared block’s rule: starts /, not //, no \\ or control character, ≤ 200', { skip }, () => {
  for (const p of ['/', '/#apps', '/weather/#radar', '/' + 'a'.repeat(199)]) assert.equal(R.ownPath(p), true, p);
  for (const p of ['', 'x', '//x', '/\\x', '/\nx', '/\u0000', '/' + 'a'.repeat(200), null, 1, 'https://inflite.ai/']) assert.equal(R.ownPath(p), false, String(p));
});

test('the router is pure: no DOM, no storage, no history, no network', { skip }, async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('router.js', ROOF), 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  for (const bad of [/\bdocument\b/, /\bwindow\b/, /localStorage|sessionStorage|indexedDB/, /\bhistory\b/, /\bfetch\(/, /\bimport\b/, /addEventListener/]) assert.ok(!bad.test(src), String(bad));
});
