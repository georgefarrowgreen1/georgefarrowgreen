// One roof's router (the inflite repo's today/public/roof/router.js, where it's beside this one; spec §3.3, D6): every
// address of the framework read into its Route and written back, tab targets (/#you=<id>), a place and a section
// together, format's calls with no kind or a key of another section, and what's never the framework's: another origin,
// //x, a \ or a control character, a long path or hash (a long query is only dropped), and Weather's addresses with the
// roof off. Frozen by B0. Stages 2–4 (s24-contracts §3): Markets, Fitness and Mail's entries, link/stay/idb, the wider
// arg (one decodeURIComponent; TSCO.L, ^GSPC, GBPUSD=X), and roof as false, true or a map per app; Weather's cases as
// they were (with the IFL beside from before stage 2, only Weather's). Stage 3 (roof/s3/spec.md §5.1, S3-C1; frozen by its
// B0): REGISTRY.chats exactly, its routes and aliases, stay (open), raw (share: route.hash, up to 7000 characters), the
// roof map, and skip (/chats/in/…, any /chats/ address with ?engine): with the IFL beside from before stage 3, skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOF, roofSkip } from './fixtures/roof.mjs';

const R = roofSkip ? null : await import(new URL('router.js', ROOF));
const skip = roofSkip;
const ORIGIN = 'https://inflite.ai';
const on = { roof: true, origin: ORIGIN }, off = { roof: false, origin: ORIGIN };
const tab = (t, arg = null) => ({ kind: 'tab', tab: t, arg });
const app = (section, key = section, arg = null, query = '') => ({ kind: 'app', app: 'weather', section, key, arg, query });
// (the IFL beside has stages 2–4's REGISTRY: j0's router)
const S24 = !!R?.REGISTRY?.markets;
const s24 = skip || (!S24 && 'the inflite repo beside has no stage 2–4 REGISTRY yet (router.js before j0)');
// (the IFL beside has stage 3's REGISTRY.chats: B0's router)
const S3 = !!R?.REGISTRY?.chats;
const s3 = skip || (!S3 && 'the inflite repo beside has no REGISTRY.chats yet (router.js before stage 3’s B0)');
const WEATHER = {
  app: 'weather', name: 'Weather', path: '/weather/', entry: '/weather/roof/weather.js', connector: '/weather/roof/connector.js',
  css: ['/weather/roof/weather.css', '/weather/roof/wxcore.css', '/weather/roof/wxsettings.css', '/weather/roof/radar.css'],
  sections: [['now', 'Now'], ['days', '16 Days'], ['radar', 'Radar'], ['warnings', 'Warnings']],
  aliases: { day: 'days', settings: 'now' } };

test('the registry and the tab bar: Weather’s paths, files, sections and aliases; the four tabs as the shared block has them', { skip }, () => {
  if (S24) assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.weather)), WEATHER, 'Weather’s entry as stage 1 had it');
  else assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY)), { weather: WEATHER });
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
    // (Weather's arg as stage 1 had it: [\w-] as written, never decoded; the wider rule is the new modules')
    ['/weather/#day=2026%2D11%2D03', app('days', 'day'), '/weather/#day'], ['/weather/#settings=a.b', app('now', 'settings'), '/weather/#settings'],
    ['/weather/#settings=a=b', app('now', 'settings'), '/weather/#settings'], ['/weather/#day=%5EX', app('days', 'day'), '/weather/#day'],
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
  assert.equal(R.format({ app: 'weather', key: 'settings', arg: 'a.b' }), '/weather/#settings', 'Weather’s arg: stage 1’s [\\w-] only');
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
  for (const href of ['/weather', '/weather/radar', '/weather/app.js', '/weather/roof/weather.js', '/Weather/', ...(S3 ? [] : ['/chats/', '/chats/#open=1']), '/chats/in/', '/chats/?engine=1', ...(S24 ? [] : ['/fitness/', '/markets/', '/mail/']), '/api/hub', '/x/']) {
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

// ---- stages 2–4 (s24-contracts §3) ----
test('stages 2–4: REGISTRY’s Markets, Fitness and Mail exactly; link, stay and idb only where named; all frozen', { skip: s24 }, () => {
  assert.deepEqual(Object.keys(R.REGISTRY), ['weather', 'markets', 'fitness', 'mail', ...(S3 ? ['chats'] : [])]);
  assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.markets)), { app: 'markets', name: 'Markets', path: '/markets/', link: 'finance',
    entry: '/markets/roof/markets.js', connector: '/markets/roof/connector.js', css: ['/markets/roof/markets.css'],
    sections: [['today', 'Today'], ['holdings', 'Holdings'], ['news', 'News']],
    aliases: { s: 'today', income: 'holdings', isa: 'holdings', vs: 'holdings', about: 'holdings' } });
  assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.fitness)), { app: 'fitness', name: 'Fitness', path: '/fitness/', idb: 'fitness',
    entry: '/fitness/roof/fitness.js', connector: '/fitness/roof/connector.js', css: ['/fitness/roof/fitness.css', '/fitness/roof/fxviews.css'],
    sections: [['today', 'Today'], ['activities', 'Activities'], ['routes', 'Routes'], ['progress', 'Progress']],
    aliases: { plan: 'today', day: 'today', offer: 'today', settings: 'today', act: 'activities' } });
  assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.mail)), { app: 'mail', name: 'Mail', path: '/mail/', link: 'email',
    entry: '/mail/roof/mail.js', connector: '/mail/roof/connector.js', css: ['/mail/roof/mail.css', '/mail/roof/reader.css', '/mail/roof/mailsheets.css'],
    sections: [['people', 'People'], ['updates', 'Updates'], ['later', 'Later'], ['done', 'Done']],
    aliases: { thread: 'people', settings: 'people', signin: 'people' }, stay: ['thread'] });
  for (const r of Object.values(R.REGISTRY)) {
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.css) && Object.isFrozen(r.sections) && Object.isFrozen(r.aliases) && r.sections.every(Object.isFrozen), r.app);
    if (r.stay) assert.ok(Object.isFrozen(r.stay));
    for (const k of ['raw', 'skip']) if (r[k]) assert.ok(Object.isFrozen(r[k]), `${r.app}.${k} frozen`);
    for (const k of Object.keys(r)) assert.ok(['app', 'name', 'path', 'entry', 'connector', 'css', 'sections', 'aliases', 'link', 'stay', 'idb', ...(S3 ? ['tab', 'id', 'raw', 'service', 'skip'] : [])].includes(k), `${r.app}.${k}: a known field`);
    assert.equal(r.path, `/${r.app}/`); assert.ok(r.entry.startsWith(`${r.path}roof/`) && r.connector.startsWith(`${r.path}roof/`));
  }
});

test('stages 2–4: roof as false, true or a map: an app’s routes are ours only where its flag is true; tabs always', { skip: s24 }, () => {
  const paths = { weather: '/weather/#radar', markets: '/markets/#news', fitness: '/fitness/#progress', mail: '/mail/#later' };
  for (const [a, p] of Object.entries(paths)) {
    assert.equal(R.parse(p, { roof: true })?.app, a, `${a}: roof true`);
    assert.equal(R.parse(p, { roof: false }), null, `${a}: roof false`);
    assert.equal(R.parse(p, { roof: { [a]: true } })?.app, a, `${a}: its own flag`);
    assert.equal(R.parse(p, { roof: { [a]: false } }), null, `${a}: its flag false`);
    assert.equal(R.owns(p, { roof: Object.fromEntries(Object.keys(paths).map((k) => [k, k !== a])) }), false, `${a}: every other flag on, its own off`);
    for (const v of ['1', 1, 'true', {}]) assert.equal(R.parse(p, { roof: { [a]: v } }), null, `${a}: only true is on (${JSON.stringify(v)})`);
  }
  assert.deepEqual(R.parse('/#apps', { roof: { weather: false } }), tab('apps'));
  assert.deepEqual(R.parse('/', { roof: {} }), tab('today'));
  assert.deepEqual(R.parse('/weather/#days', { roof: { weather: true, markets: false } }), app('days'), 'Weather as with roof true');
});

test('stages 2–4: the wider arg, after one decodeURIComponent: TSCO.L, ^GSPC, GBPUSD=X; a bad % or anything else is null; format writes it back', { skip: s24 }, () => {
  const mk = (key, arg, section = 'today') => ({ kind: 'app', app: 'markets', section, key, arg, query: '' });
  const cases = [
    ['/markets/#s=TSCO.L', mk('s', 'TSCO.L'), '/markets/#s=TSCO.L'],
    ['/markets/#s=%5EGSPC', mk('s', '^GSPC'), '/markets/#s=^GSPC'],
    ['/markets/#s=^GSPC', mk('s', '^GSPC'), '/markets/#s=^GSPC'],
    ['/markets/#s=GBPUSD%3DX', mk('s', 'GBPUSD=X'), '/markets/#s=GBPUSD=X'],
    ['/markets/#s=GBPUSD=X', mk('s', 'GBPUSD=X'), '/markets/#s=GBPUSD=X'],
    ['/markets/#s=%E0%A4', mk('s', null), '/markets/#s'],
    ['/markets/#s=%0A', mk('s', null), '/markets/#s'],
    ['/markets/#s=a%20b', mk('s', null), '/markets/#s'],
    ['/markets/#s=%2F', mk('s', null), '/markets/#s'],
    ['/markets/#s=' + 'A'.repeat(41), mk('s', null), '/markets/#s'],
    ['/markets/#income', mk('income', null, 'holdings'), '/markets/#income'],
    ['/markets/', mk('today', null), '/markets/'],
    ['/fitness/#act=12345', { kind: 'app', app: 'fitness', section: 'activities', key: 'act', arg: '12345', query: '' }, '/fitness/#act=12345'],
    ['/fitness/#settings=numbers', { kind: 'app', app: 'fitness', section: 'today', key: 'settings', arg: 'numbers', query: '' }, '/fitness/#settings=numbers'],
    ['/mail/#thread=0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', { kind: 'app', app: 'mail', section: 'people', key: 'thread', arg: '0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b', query: '' }, '/mail/#thread=0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b'],
    ['/mail/#people', { kind: 'app', app: 'mail', section: 'people', key: 'people', arg: null, query: '' }, '/mail/'],
  ];
  for (const [href, route, back] of cases) {
    assert.deepEqual(R.parse(href, on), route, href);
    assert.equal(R.format(route), back, `${href} → ${back}`);
    const again = R.parse(back, on);
    assert.equal(again.arg, route.arg, `${back} re-parses to the same arg`);
  }
  // (Weather's args stay as they were: a day, a settings page)
  assert.deepEqual(R.parse('/weather/#day=2026-11-03', on), app('days', 'day', '2026-11-03'));
  // (You's arg as stage 1: [\w-] only)
  assert.deepEqual(R.parse('/#you=a.b', on), tab('you')); assert.equal(R.format(tab('you', 'a.b')), '/#you');
  // (the D6 tidy's call for Mail's People and a spread reader route whose section changed)
  assert.equal(R.format({ app: 'mail', section: 'people' }), '/mail/');
  assert.equal(R.format({ kind: 'app', app: 'mail', section: 'later', key: 'thread', arg: 'x' }), '/mail/#later');
  assert.equal(R.format({ app: 'markets', key: 's', arg: 'TSCO.L' }), '/markets/#s=TSCO.L');
});

// ---- stage 3 (roof/s3/spec.md §5.1, S3-C1, S3-D9) ----
const UUID = '0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
const ch = (section, key = section, arg = null, query = '', hash) => ({ kind: 'app', app: 'chats', section, key, arg, query, ...(hash === undefined ? {} : { hash }) });
const chOn = { roof: { chats: true }, origin: ORIGIN };

test('stage 3: REGISTRY.chats exactly as spec §5.1 (tab, id, link, idb, service, raw, stay, skip), frozen; only Chats has the new fields', { skip: s3 }, () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.REGISTRY.chats)), { app: 'chats', id: 'chat', name: 'Chats', path: '/chats/', tab: 'chats', link: 'chat', idb: 'inflight',
    entry: '/chats/roof/chats.js', connector: '/chats/roof/connector.js', service: '/chats/roof/service.js',
    css: ['/chats/roof/chats.css', '/chats/roof/chsheets.css', '/chats/cards.css'],
    sections: [['chats', 'Chats'], ['friends', 'Friends']],
    aliases: { open: 'chats', settings: 'chats', account: 'chats', flightlog: 'chats', share: 'chats', requests: 'friends', add: 'friends' },
    stay: ['open'], raw: ['share'], skip: { paths: ['/chats/in/'], query: ['engine'] } });
  const c = R.REGISTRY.chats;
  assert.ok(Object.isFrozen(c.skip.paths) && Object.isFrozen(c.skip.query) && Object.isFrozen(c.raw) && Object.isFrozen(c.stay));
  for (const r of Object.values(R.REGISTRY)) if (r.app !== 'chats') for (const k of ['tab', 'id', 'raw', 'service', 'skip']) assert.equal(r[k], undefined, `${r.app}.${k}`);
  assert.equal(R.TABS[c.tab][1], c.path, 'its tab is the tab bar’s Chats, at its path');
});

test('stage 3: Chats’ routes and aliases (S3-D9), written back; #open stays an arg (a UUID), #add a handle', { skip: s3 }, () => {
  const cases = [
    ['/chats/', ch('chats'), '/chats/'], ['/chats/index.html', ch('chats'), '/chats/'], ['/chats/#chats', ch('chats'), '/chats/'],
    ['/chats/#friends', ch('friends'), '/chats/#friends'],
    [`/chats/#open=${UUID}`, ch('chats', 'open', UUID), `/chats/#open=${UUID}`],
    ['/chats/#requests', ch('friends', 'requests'), '/chats/#requests'],
    ['/chats/#add=pat_1', ch('friends', 'add', 'pat_1'), '/chats/#add=pat_1'],
    ['/chats/#settings', ch('chats', 'settings'), '/chats/#settings'], ['/chats/#account', ch('chats', 'account'), '/chats/#account'],
    ['/chats/#flightlog', ch('chats', 'flightlog'), '/chats/#flightlog'],
    // (the sign-in trip's hashes aren't routes: the list, and the host hops them to /chats/in/ before the frame, S3-D8)
    ['/chats/#signin-start&then=%2F', ch('chats'), '/chats/'], ['/chats/#signin=abc', ch('chats'), '/chats/'], ['/chats/#verify=x', ch('chats'), '/chats/'],
    // (a bad arg: dropped)
    ['/chats/#open=a%20b', ch('chats', 'open'), '/chats/#open'], ['/chats/#open=' + 'a'.repeat(41), ch('chats', 'open'), '/chats/#open'],
    ['/chats/#nope=1', ch('chats'), '/chats/'],
  ];
  for (const [href, route, back] of cases) {
    assert.deepEqual(R.parse(href, chOn), route, href);
    assert.equal(R.format(route), back, `${href} → ${back}`);
  }
  assert.equal(R.format({ app: 'chats', key: 'open', arg: UUID }), `/chats/#open=${UUID}`, 'fw.nav.href("open", id)');
  assert.equal(R.format({ app: 'chats', section: 'friends' }), '/chats/#friends');
  assert.equal(R.format({ app: 'chats', section: 'chats' }), '/chats/', 'the tidy after a deep link');
  assert.equal(R.format({ ...R.parse(`/chats/#open=${UUID}`, chOn), section: 'friends' }), '/chats/#friends', 'a spread chat route whose section changed');
});

test('stage 3: share is raw: route.hash is the whole hash as written (≤ 7000), only for a raw key, and a long one is ours only there', { skip: s3 }, () => {
  const h = 'share=Rain%20at%203&card=AbC-_9&back=%2Fweather%2F%23days';
  assert.deepEqual(R.parse(`/chats/#${h}`, chOn), ch('chats', 'share', null, '', h));
  assert.deepEqual(R.parse(`${ORIGIN}/chats/index.html?x=1#${h}`, chOn), ch('chats', 'share', null, '?x=1', h));
  const long = 'share=' + 'w'.repeat(6994);
  assert.equal(long.length, 7000);
  assert.equal(R.parse(`/chats/#${long}`, chOn).hash, long, 'up to 7000 characters');
  assert.equal(R.parse(`/chats/#${long}x`, chOn), null, 'past 7000: not ours');
  assert.equal(R.parse('/chats/#open=' + 'x'.repeat(3000), chOn), null, 'a long hash of a key that isn’t raw: as before');
  assert.equal(R.parse('/weather/#share=' + 'x'.repeat(3000), on), null, 'only the app whose key it is');
  assert.equal(R.parse('/' + 'p'.repeat(2050) + '#share=x', on), null, 'the path still capped');
  for (const href of ['/chats/', `/chats/#open=${UUID}`, '/chats/#friends']) assert.ok(!('hash' in R.parse(href, chOn)), `${href}: no hash`);
  assert.equal(R.format(R.parse(`/chats/#${h}`, chOn)), '/chats/#share', 'never written back: the tidy takes the words out of the address');
  assert.equal(R.format({ app: 'chats', section: 'chats' }), '/chats/');
});

test('stage 3: Chats’ addresses are ours only with its flag; /chats/in/… and ?engine never are', { skip: s3 }, () => {
  for (const p of ['/chats/', `/chats/#open=${UUID}`, '/chats/#friends']) {
    assert.equal(R.parse(p, { roof: { chats: true } })?.app, 'chats', p);
    assert.equal(R.parse(p, { roof: true })?.app, 'chats', `${p}: roof true`);
    for (const roof of [false, { chats: false }, { weather: true, markets: true, fitness: true, mail: true }, { chats: '1' }]) assert.equal(R.parse(p, { roof }), null, `${p}: ${JSON.stringify(roof)}`);
  }
  for (const p of ['/chats/in/', '/chats/in/index.html', '/chats/in/#account', '/chats/in/#signin-start&then=%2Fchats%2F', '/chats/?engine=1', '/chats/index.html?engine=1#open=x', '/chats/?a=1&engine', `${ORIGIN}/chats/?engine=1`, '/chats/tracker.html', '/chats/roof/chats.js', '/chats']) {
    assert.equal(R.parse(p, { roof: true, origin: ORIGIN }), null, p);
    assert.equal(R.owns(p, { roof: true, origin: ORIGIN }), false, p);
  }
  assert.equal(R.parse('/chats/?engines=1', chOn)?.app, 'chats', 'only a query named engine');
  assert.equal(R.parse('/weather/?engine=1#radar', on)?.app, 'weather', 'skip is Chats’ own');
});
