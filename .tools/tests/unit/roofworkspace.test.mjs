// OS's optional asset closure has its own budget. Ordinary app first-open graphs
// remain unchanged and keep roofbudget.test.mjs's existing ceilings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { IFL, ROOF, roofSkip, fileOf } from './fixtures/roof.mjs';
import { OS_CORE_JS, OS_FILES as osFiles, OS_FILES_JS, OS_FILES_CSS, OS_ENTRIES, OS_BRIDGES as bridges } from './fixtures/workspace.mjs';
import { minified, haveEsbuild, staticGraph, staticImports, lazyClosure } from './fixtures/budget.mjs';

const skip = roofSkip || !existsSync(new URL('workspace.js', ROOF)) && 'the adjacent framework predates Workspace v1';
const pub = f => readFileSync(new URL('today/public/' + f, IFL), 'utf8');
const js = OS_CORE_JS.map(f => '/roof/' + f);
const published = p => p.startsWith('/roof/') || p === '/os.webmanifest' ? new URL('today/public' + p, IFL) : fileOf(p);
const plain = v => JSON.parse(JSON.stringify(v));
function worker(url) {
  const context = vm.createContext({ URL, self: { location: new URL(url), addEventListener() {} } });
  vm.runInContext(pub('sw.js') + '\nglobalThis.inspect = { files: FILES, optional: OS_FILES, mode: OS_MODE, keepList, mail: MAIL(), openAt };', context);
  return context.inspect;
}
function hostMode(url) {
  const match = pub('app.js').match(/^const OS_MODE = (.*);$/m);
  assert.ok(match, 'the host declares its surface selection');
  return vm.runInNewContext(match[1], { location: new URL(url), URL });
}

test('OS assets are cacheable only on the exact OS host or an explicit local preview; apex and lookalikes keep their ordinary shell', { skip }, () => {
  for (const [url, enabled] of [
    ['https://os.inflite.ai/sw.js', true], ['https://os.inflite.ai/sw.js?os=0', true],
    ['https://inflite.ai/sw.js', false], ['https://inflite.ai/sw.js?os=1', false],
    ['https://next.inflite.ai/sw.js?os=1', false], ['https://evil-os.inflite.ai/sw.js?os=1', false],
    ['https://os.inflite.ai.evil.example/sw.js?os=1', false],
    ['http://localhost:4173/sw.js?os=1', true], ['http://workspace.test/sw.js?os=1', true],
    ['http://localhost:4173/sw.js', false], ['http://workspace.test/sw.js?os=01', false],
  ]) {
    const sw = worker(url);
    assert.equal(sw.mode, enabled, url); assert.equal(hostMode(url), enabled, 'host and worker agree: ' + url);
    assert.deepEqual(plain(sw.optional), osFiles);
    assert.deepEqual(plain(sw.files.filter(f => osFiles.includes(f))), enabled ? osFiles : [], url);
    assert.equal(new Set(sw.files).size, sw.files.length, 'no duplicate shell assets');
    assert.ok(sw.files.every(f => f === '/' || /^\/[\w./-]+\.(?:js|css|svg|png|webmanifest)$/.test(f)), 'shell assets contain no API, auth query, share payload or account response');
  }
  const sw = worker('https://os.inflite.ai/sw.js');
  assert.equal(sw.mail, 'https://email.inflite.ai');
  assert.equal(sw.openAt('weather', 'https://weather.inflite.ai/#days'), '/weather/#days');
});

test('the OS updater and worker list exactly the optional closure and the manifest opens the workspace', { skip }, async () => {
  const host = pub('app.js'), match = host.match(/^const OS_FILES = (\[[^\n]+\]);$/m);
  assert.ok(match); assert.deepEqual(JSON.parse(match[1]), osFiles);
  assert.match(host, /\.\.\.\(OS_MODE \? OS_FILES : \[\]\)/, 'the normal updater does not fetch OS assets');
  const html = pub('index.html');
  for (const f of osFiles) { assert.ok(existsSync(published(f)), f); assert.ok(!html.includes(`href="${f}"`), f + ' is not statically preloaded or linked on the ordinary page'); }
  const shared = new Set(['frame', 'router', 'header', 'tabs', 'sheet', 'toast', 'ui', 'search', 'send', 'modules', 'connectors', 'requests', 'tasks', 'screens'].map(name => '/roof/' + name + '.js'));
  const loaded = new Set(OS_ENTRIES), walk = p => {
    const source = readFileSync(published(p), 'utf8');
    const dynamic = [...source.matchAll(/\bimport\(\s*["']([^"']+)["']/g)].map(match => match[1]);
    for (const spec of [...staticImports(source), ...dynamic]) {
      const path = new URL(spec, 'https://os.inflite.ai' + p).pathname;
      if (!path.startsWith('/roof/') || !path.endsWith('.js') || shared.has(path)) continue;
      if (!loaded.has(path)) { loaded.add(path); walk(path); }
    }
  };
  for (const entry of OS_ENTRIES) walk(entry);
  assert.deepEqual([...loaded].sort(), [...js].sort(), 'optional JS is exactly the reachable host/picker graph, including literal lazy imports');
  const manifest = JSON.parse(pub('os.webmanifest'));
  assert.equal(manifest.name, 'InFlite OS'); assert.equal(manifest.start_url, '/#workspace'); assert.equal(manifest.scope, '/');
  assert.ok(manifest.icons.length); for (const icon of manifest.icons) assert.ok(existsSync(new URL('today/public/' + icon.src.replace(/^\//, ''), IFL)), icon.src);
});

test('only curated pane adapters and styles are lazy, same-app cache-safe assets; normal module graphs exclude them', { skip }, async () => {
  const { WORKSPACE_APPS } = await import(new URL('workspace-catalog.js', ROOF));
  assert.deepEqual(WORKSPACE_APPS.filter(a => a.pane).map(a => a.id).sort(), ['chats', 'fitness', 'mail', 'markets', 'weather']);
  for (const app of ['fitness', 'weather', 'markets', 'chats', 'mail']) {
    const { connector } = await import(fileOf(`/${app}/roof/connector.js`));
    const graph = app === 'chats' ? [...new Set([...await staticGraph(app), ...await staticGraph(app, '/chats/roof/service.js'), ...await staticGraph(app, '/chats/roof/core.js')])] : await staticGraph(app), closure = await lazyClosure(app, graph), optional = bridges.filter(p => p.startsWith('/' + app + '/'));
    const linkedCss = [...readFileSync(fileOf(graph[0]), 'utf8').matchAll(/link\.href = "([^" ]+\.css)"/g)].map(m => m[1]);
    assert.deepEqual([...connector.lazy].sort(), [...closure, ...linkedCss, optional[1]].sort(), 'only the import closure, explicitly linked app CSS and curated workspace stylesheet are lazy');
    assert.deepEqual(WORKSPACE_APPS.find(a => a.id === app).workspace, { css: optional[1] });
    assert.ok(closure.includes(optional[0]), 'adapter is reached through a literal lazy import');
    for (const f of optional) { assert.ok(existsSync(published(f)), f); assert.ok(connector.lazy.includes(f), f + ' is retained with optional assets'); assert.ok(!connector.files.includes(f) && !graph.includes(f), f + ' adds no ordinary first-open download'); }
    const sw = worker('https://os.inflite.ai/sw.js'), list = [...connector.files, ...optional];
    assert.deepEqual(plain(sw.keepList({ app, build: '9.99', files: list })), list);
    for (const bad of ['/api/boot', `/${app}/api/plan`, `/${app}/roof/API/private.js`, `/${app}/account.json`, `/${app}/api/plan?token=secret`, `/${app}/roof/workspace.css?account=one`, `/${app}/../api/account`, 'https://evil.example/payload.js']) assert.equal(sw.keepList({ app, build: '9.99', files: [...list, bad] }), null, bad);
  }
});

test('all existing app connector assets remain valid static JS/CSS under the stricter worker cache boundary', { skip }, async () => {
  const { REGISTRY } = await import(new URL('router.js', ROOF));
  const sw = worker('https://os.inflite.ai/sw.js');
  for (const app of Object.keys(REGISTRY)) {
    const { connector } = await import(fileOf(REGISTRY[app].connector));
    const files = [...connector.files, ...(connector.lazy || [])];
    assert.ok(files.every(p => /\.(?:js|css)$/.test(p) && !/\/api(?:\/|$)/i.test(p)), app + ': every existing declared asset is static code/style');
    assert.deepEqual(plain(sw.keepList({ app, build: '9.99', files })), files, app + ': no legitimate cache graph lost');
  }
});

test('OS v3 has independently bounded shell, Commands, Files and five adapters; ordinary app ceilings remain separate', { skip: skip || !haveEsbuild() && 'esbuild is not installed' }, t => {
  const costs = [...osFiles.filter(p => /\.(?:js|css)$/.test(p)), ...bridges].map(path => ({ path, bytes: gzipSync(minified(readFileSync(published(path), 'utf8'), path.endsWith('.css')), { level: 9 }).length }));
  const fileAssets = new Set([...OS_FILES_JS, ...OS_FILES_CSS].map(name => '/roof/' + name)), commandAssets = new Set(['/roof/workspace-commands.js', '/roof/workspace-commands.css']);
  const base = p => p.startsWith('/roof/') && !fileAssets.has(p) && !commandAssets.has(p);
  const group = predicate => costs.filter(f => predicate(f.path));
  const sum = (files, ext) => files.filter(f => f.path.endsWith(ext)).reduce((n, f) => n + f.bytes, 0);
  const check = (name, files, jsKiB, cssKiB) => {
    const jsBytes = sum(files, '.js'), cssBytes = sum(files, '.css');
    t.diagnostic(JSON.stringify({ name, jsBytes, cssBytes, jsLimit: jsKiB * 1024, cssLimit: cssKiB * 1024 }));
    assert.ok(jsBytes <= jsKiB * 1024, `${name}: ${jsBytes} bytes JS exceeds ${jsKiB * 1024}`);
    assert.ok(cssBytes <= cssKiB * 1024, `${name}: ${cssBytes} bytes CSS exceeds ${cssKiB * 1024}`);
  };
  // Files v3 adds a lazy private Drive/Explorer, transfer lifecycle and safe route
  // ownership. Bound its exact reviewed graph independently from ordinary apps
  // and the shared core; no filename-prefix exclusion or native cap increase.
  check('base/window shell', group(base), 26, 5.5);
  check('Commands', group(p => commandAssets.has(p)), 3.5, 1);
  check('Files', group(p => fileAssets.has(p)), 32, 4);
  for (const [app, cap] of [['fitness', 3.75], ['weather', 2.75], ['markets', 1.5], ['chats', 2.75], ['mail', 3.5]]) check(app + ' adapter', group(p => p.startsWith('/' + app + '/')), cap, 1);
  check('complete optional OS v3', costs, 74, 13);
  t.diagnostic(JSON.stringify({ files: costs }));
});

test('workspace routing is an explicit host opt-in and does not widen app or origin access', { skip }, async () => {
  const { parse, format } = await import(new URL('router.js', ROOF));
  assert.deepEqual(parse('/#workspace=ride'), { kind: 'tab', tab: 'today', arg: null });
  assert.deepEqual(parse('/#workspace=ride', { workspace: true }), { kind: 'tab', tab: 'workspace', arg: 'ride' });
  assert.equal(format({ kind: 'tab', tab: 'workspace', arg: 'ride' }), '/#workspace=ride');
  for (const bad of ['/#workspace=bad%20id', '/#workspace=../account', '/#workspace=' + 'a'.repeat(41)]) assert.equal(parse(bad, { workspace: true }).tab, 'today', bad);
  assert.equal(parse('/fitness/#today', { workspace: true, roof: false }), null);
  assert.equal(parse('https://evil.example/#workspace=ride', { workspace: true, origin: 'https://os.inflite.ai' }), null);
  assert.equal(parse('//evil.example/#workspace=ride', { workspace: true }), null);
});
