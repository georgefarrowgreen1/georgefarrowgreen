import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const theme = readFileSync(new URL('../../../pigeon/theme.js', import.meta.url), 'utf8');
function page({ host = 'os.inflite.ai', path = '/chats/in/', hub = true, mobile = false } = {}) {
  const attrs = new Map(), classes = new Set(), timers = [];
  const root = { setAttribute: (key, value) => attrs.set(key, value), toggleAttribute() {}, classList: { add: value => classes.add(value), remove: value => classes.delete(value) } };
  const context = vm.createContext({ __iflMotionReady: true, __iflZoomBlocked: true,
    document: { documentElement: root, querySelector: selector => selector === 'meta[name="ifl-hub"]' && hub ? {} : null, addEventListener() {} },
    navigator: { userAgent: mobile ? 'Mozilla/5.0 (iPhone)' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: mobile ? 5 : 0 },
    location: { hostname: host, pathname: path, search: '', hash: '', origin: 'https://' + host }, localStorage: { getItem: () => null },
    matchMedia: () => ({ matches: false }), setTimeout: fn => timers.push(fn) });
  context.window = context; context.parent = context;
  vm.runInContext(theme, context);
  return { attrs, timers };
}

test('only the exact OS native unlock page can bootstrap a desktop Chat key', () => {
  for (const path of ['/chats/in/', '/chats/in/index.html']) {
    const result = page({ path }); assert.equal(result.attrs.has('data-device'), false); assert.equal(result.timers.length, 1, 'OS unlock keeps the existing early load-failure fallback');
  }
  for (const options of [{ host: 'inflite.ai' }, { host: 'chat.inflite.ai' }, { host: 'os.inflite.ai.evil.example' }, { host: 'other.inflite.ai' }, { hub: false },
    { path: '/chats/' }, { path: '/chats/in' }, { path: '/chats/in/extra' }, { path: '/pigeon/in/' }, { path: '/chats/in/%2e%2e/' }]) {
    assert.equal(page(options).attrs.get('data-device'), 'computer', JSON.stringify(options));
  }
  assert.equal(page({ mobile: true, host: 'chat.inflite.ai', hub: false, path: '/' }).attrs.has('data-device'), false, 'phone handling stays unchanged');
});
