// Today's page (the inflite repo's today/public, where it's checked out beside this one), as One roof builds on it
// (spec §3.1, §3.8, §4.1, §9.4 TD): nothing it draws has an inline style or an inline script, which its CSP refuses;
// its page is InFlite's one page (the hub's marker, the frame's hosts: the header, the screens and the tab bar, the
// day's stylesheet and the framework's, the way in), its sheets InFlite's sheet in the frozen markup (Weather
// Notifications among them), each of the framework's static files asked for ahead (modulepreload); and app.js imports
// only the framework's static files (frame, router, header, tabs, sheet, toast, ui, search, send), the rest when needed.
// Where the inflite repo beside has no roof yet (its live branch, while this repo goes live first: roofSkip), the
// milestone-1 page is checked as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { IFL, roofSkip } from './fixtures/roof.mjs';

// (the inflite repo beside, or where ROOF_IFL points: fixtures/roof.mjs)
const PUB = IFL ? new URL('today/public/', IFL) : new URL('file:///nonexistent/');
const skip = !existsSync(new URL('index.html', PUB)) && 'the inflite repo isn’t beside this one';
// (InFlite's page's cases: skipped, not failed, where the inflite repo beside has no hub yet, as its live branch beside
// main while this repo goes live first)
const tfSkip = skip || (!existsSync(new URL('../src/hub.js', PUB)) && 'the inflite repo beside is from before Today First (its live branch, while this repo goes live first)');
// (the milestone-1 page's own case, only where the roof isn't there; the roof's, only where it is)
const oldSkip = tfSkip || (!roofSkip && 'the inflite repo beside has the roof: its page is checked by the case after');
const roofOnly = tfSkip || roofSkip;
const pub = (f) => readFileSync(new URL(f, PUB));
const STATIC = ['frame', 'router', 'header', 'tabs', 'sheet', 'toast', 'ui', 'search', 'send'];
// (app.js after the shared block, which is a copy of MAIN's menu.js, unchanged here)
const own = () => { const js = String(pub('app.js')), end = js.indexOf('// ==== end of InFlite’s menu ===='.replace('’', "'")); return end > 0 ? js.slice(end) : js; };

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

test('its page is InFlite’s one page: the hub’s marker, the views and the tab bar, the day’s stylesheet, and the way in', { skip: oldSkip }, () => {
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

test('under the roof, its page is the framework’s: the marker, the frame’s hosts (#hd, #views with Today, Apps and You, #tabs), roof.css, and the way in', { skip: roofOnly }, () => {
  const html = String(pub('index.html'));
  assert.match(html, /<head>\s*<meta charset="utf-8">\s*<meta name="ifl-hub" content="\/">/, 'the marker that says it’s the hub, first after its charset');
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="InFlite">/);
  // (the stylesheets: Today's own, then the framework's (its tokens and components over app.css's), then the day's)
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(sheets, ['/app.css', '/roof/roof.css', '/day.css'], 'app.css, roof.css, day.css, in that order');
  // (#in: the header's host, #views (#today, #apps, #you: screens) and the tab bar's; #today: its top card, Waiting, Coming
  // Up, the rest. Weather's screen is made in #views by the frame on first open)
  const inner = html.slice(html.indexOf('<div class="today-in"'), html.indexOf('<!-- The page'));
  const ids = [...inner.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['in', 'hd', 'views', 'today', 'kept', 'top', 'waiting', 'coming', 'rest', 'apps', 'you', 'tabs']);
  assert.match(inner, /<div id="hd"><\/div>/, 'the header’s host, empty: the frame builds the header in it');
  assert.match(inner, /<nav class="ifl-tabs" id="tabs" aria-label="InFlite"><\/nav>/, 'the tab bar’s host, empty: the frame’s');
  assert.match(inner, /<main id="today" class="view ifl-screen" aria-label="Today">/);
  assert.match(inner, /<main id="apps" class="view ifl-screen" aria-label="Apps" hidden>/);
  assert.match(inner, /<main id="you" class="view ifl-screen" aria-label="You" hidden>/);
  const today = inner.slice(inner.indexOf('id="today"'), inner.indexOf('id="apps"'));
  assert.ok(!/<(input|textarea|select)\b/.test(today), 'nothing to type in on Today');
  assert.match(html, /id="signinToday"[^>]*>Sign In Without Chats</);
  assert.ok(!/class="bsheet"|class="dimmer"/.test(html), 'none of the page’s old sheets');
});

test('under the roof, its sheets are InFlite’s sheet, in the frozen markup: Morning, Every App’s, Edit Today and Weather Notifications', { skip: roofOnly }, () => {
  const html = String(pub('index.html'));
  const dialogs = [...html.matchAll(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/g)].map((m) => m[0]);
  const ids = dialogs.map((d) => /\sid="([^"]+)"/.exec(d)?.[1]);
  assert.deepEqual(ids, ['morning', 'sh-every', 'sh-edit', 'sh-wxnotify'], 'the four, as dialogs');
  for (const [i, d] of dialogs.entries()) {
    const id = ids[i];
    const head = new RegExp(`^<dialog class="ifl-sheet" id="${id}" aria-labelledby="${id}-t"><div class="ifs-grab" aria-hidden="true"></div><header class="ifs-head"><h2 id="${id}-t" tabindex="-1">[^<]+</h2><button class="ifs-btn" type="button" data-close aria-label="Close">✕</button></header><div class="ifs-body"[^>]*>`);
    assert.match(d, head, `${id}: the frozen head (grab, h2 named by aria-labelledby, close)`);
    assert.match(d, /<\/div>(<footer class="ifs-acts">[\s\S]*<\/footer>)?<\/dialog>$/, `${id}: its body, then at most the action row, then the end`);
  }
  assert.match(html, /<h2 id="sh-wxnotify-t" tabindex="-1">Weather Notifications<\/h2>/);
  assert.match(html, /<div class="ifs-body" id="wxnBody"><\/div><\/dialog>/, 'Weather Notifications’ body, drawn by you.js');
  // (what Edit Today and Every App's had in their foot is in the sheet's action row)
  assert.match(dialogs[2], /<footer class="ifs-acts"><button class="ifl-btn" id="edReset" type="button">[^<]+<\/button><button class="ifl-btn primary" data-close type="button">Done<\/button><\/footer>/);
  assert.match(dialogs[1], /<footer class="ifs-acts"><button class="ifl-btn primary" type="button" id="evGo">/);
});

test('under the roof, each of the framework’s static files is asked for ahead (modulepreload), and app.js imports only those, the rest when needed', { skip: roofOnly }, () => {
  const html = String(pub('index.html'));
  const pre = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
  for (const f of STATIC) assert.ok(pre.includes(`/roof/${f}.js`), `/roof/${f}.js preloaded`);
  for (const f of ['modules', 'connectors']) assert.ok(!pre.includes(`/roof/${f}.js`), `/roof/${f}.js not preloaded: it’s loaded when needed`);
  for (const p of pre) assert.ok(existsSync(new URL(p.slice(1), PUB)), `${p} is there`);
  const js = String(pub('app.js'));
  const statics = [...js.matchAll(/^import\b[^'"]*["']([^"']+)["']/gm)].map((m) => m[1]);
  const roof = statics.filter((s) => s.startsWith('/roof/'));
  assert.deepEqual(statics.filter((s) => !s.startsWith('/roof/')), ['/cards.js'], 'beside the framework, Today’s own cards.js only');
  for (const s of roof) assert.ok(STATIC.map((f) => `/roof/${f}.js`).includes(s), `${s}: one of the framework’s static files`);
  assert.ok(roof.includes('/roof/frame.js'), 'the frame');
  // (modules.js and connectors.js: dynamic only, and no module's own file from the page)
  const dyn = [...js.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
  for (const d of dyn) assert.ok(['/apps.js', '/you.js', '/day.js', '/roof/modules.js', '/roof/connectors.js'].includes(d), `import("${d}")`);
  assert.ok(!/\/weather\/roof\//.test(own()), 'the page never names a module’s file itself: the router’s registry does');
});

test('under the roof, app.js: the hub three ways with roof read as roof === true and kept, Sign in back to the screen, history kept for the frame, Weather’s old worker let go of', { skip: roofOnly }, () => {
  const js = own();
  assert.match(js, /j\?\.roof === true/, 'roof is only ever roof === true (a missing field: off, D14)');
  assert.match(js, /"ifl-hub-ready"/); assert.match(js, /"ifl-roof"/); assert.match(js, /"ifl-roof-bounce"/);
  assert.ok(/"yes"/.test(js) && /"no"/.test(js) && /"unknown"/.test(js), 'three ways: yes, no, unknown (D23)');
  assert.ok(!/then=\/["'`]/.test(js), 'Sign in never comes back to / alone: then= is the screen’s path and hash (RI15)');
  assert.equal((js.match(/#signin-start&then=\$\{thenHere\(\)\}/g) || []).length, 2, 'then= in the way in’s href and in its click');
  assert.match(js, /const thenHere = \(\) => encodeURIComponent\(location\.pathname \+ location\.hash\)/, 'its path and hash, never its query');
  assert.ok(!/replaceState\(\s*null/.test(js), 'history.state kept (the frame’s), never wiped by Today’s own code (RI1)');
  assert.ok((js.match(/F\?\.restamp\(\)/g) || []).length >= 2, 'and the frame asked to stamp its entry again after');
  // (stage 1 named /weather/ itself; stages 2–4 each module's own path from REGISTRY, s24-contracts §10)
  assert.ok(/new URL\(r\.scope\)\.pathname === "\/weather\/"/.test(js) || /const p = new URL\(r\.scope\)\.pathname; if \(go\.some\(\(a\) => p === REGISTRY\[a\]\.path\)\)/.test(js), 'Weather’s old worker at /weather/ unregistered (D10)');
  assert.match(js, /createFrame\(/); assert.match(js, /F\.screen\(/);
  for (const k of ['session:', 'lost:', 'checkSession', 'hubAgain:', 'save', 'onMe:', 'me:']) assert.ok(js.includes(k), `createFrame's opts: ${k}`);
  // (sessionStorage written only under the framework's and the hub's own keys, never with words of anyone's)
  for (const [, k] of js.matchAll(/sessionStorage\.setItem\(\s*([^,]+),/g)) assert.match(k.trim(), /^(VERIFIER_KEY|k)$/, `sessionStorage.setItem(${k})`);
});

// ---- stages 2–4 (s24-contracts §2, §10): the switches per module, and sign-out (C10) ----
const s24 = roofOnly || (!/"ifl-roof-apps"/.test(own()) && 'the inflite repo beside is from before stages 2–4 (no ifl-roof-apps)');
test('stages 2–4, app.js: /api/hub’s apps kept as ifl-roof-apps (booleans only), passed to the frame as session().apps and to parse as a map; F.setRoof(roof, apps)', { skip: s24 }, () => {
  const js = own();
  assert.match(js, /APPS_KEY = "ifl-roof-apps"/);
  assert.match(js, /ss\.set\(APPS_KEY, JSON\.stringify\(apps\)\)/, 'kept as JSON');
  assert.match(js, /const appsFrom = \(a, roof\) => \{ const o = \{\}; for \(const k of Object\.keys\(REGISTRY\)\) o\[k\] = a && typeof a === "object" \? a\[k\] === true : k === "weather" && !!roof; return o; \};/, 'names from REGISTRY, each only ever === true; none said: Weather’s roof alone');
  assert.match(js, /session: \(\) => \(\{ view: S\.view, hub: S\.hub, roof: S\.roof, apps: S\.apps, links:/);
  assert.match(js, /parse\(path, \{ roof: S\.hub \? S\.apps : false \}\)/, 'the host’s own parse: the map');
  assert.match(js, /F\?\.setRoof\(on, apps\)/);
  assert.doesNotMatch(js, /roof: S\.hub && S\.roof/, 'never one flag for every app');
});

test('stages 2–4, app.js: a module’s boot trusts a kept answer only with hub yes and that module on; the bounce marker kept for an off module’s path (RI4); its own address by REGISTRY’s link', { skip: s24 }, () => {
  const js = own();
  assert.match(js, /const trusted = BOOT_APP \? v === "1" && a\[BOOT_APP\.app\] === true :/);
  assert.match(js, /if \(state === "yes"\) \{ retireOld\(\); if \(!BOOT_APP \|\| apps\[BOOT_APP\.app\]\) ss\.del\(BOUNCE_KEY\); \}/, 'the marker goes only where this document’s module is on');
  assert.match(js, /if \(state === "yes" && !appsSaid\[BOOT_APP\.app\]\) \{\n    const ln = BOOT_APP\.link \|\| BOOT_APP\.app;/);
  assert.match(js, /DEFAULT_LINKS\[ln\]\) \+ rest\.slice\(BOOT_APP\.path\.length - 1\)/);
});

test('stages 2–4, app.js sign-out (C10): every module’s flush() awaited before anything else, “Sign Out Anyway?” where something was lost; signed out elsewhere: the apps’ copies and the tab’s Mail keys go', { skip: s24 }, () => {
  const js = own();
  const so = js.slice(js.indexOf('async function signOut()'), js.indexOf('// ---------------------------------------------------------------- the two states'));
  const flush = so.indexOf('F?.flush?.()'), logout = so.indexOf('/api/logout'), dev = so.indexOf('/api/device');
  assert.ok(flush > 0 && flush < dev && flush < logout, 'flushed before the device is let go of and before /api/logout');
  assert.match(so, /if \(fl\?\.lost > 0 && !\(await anyway\(\)\)\) return;/, 'lost > 0: asked; Cancel signs nobody out');
  assert.match(so, /title: "Sign Out Anyway\?"/); assert.match(so, /Something you wrote couldn’t be saved to its app\. Sign Out Anyway\?/);
  assert.match(so, /label: "Cancel"/); assert.match(so, /label: "Sign Out"/);
  const out = js.slice(js.indexOf('function signedOutNow()'), js.indexOf('function signedIn('));
  assert.match(out, /forgetApps\(\{ chat: false \}\)/, 'signed out elsewhere: the apps’ copies (Chat’s engine signs itself out)');
  assert.match(js, /const APP_SESSION_KEPT = \["mail:signin-verifier"\];/);
  assert.match(js, /for \(const k of APP_SESSION_KEPT\) sessionStorage\.removeItem\(k\)/);
  for (const k of ['mail:replies', 'mail:unsent', 'mail:outbox', 'mail:remote-images', 'mail:lens']) assert.ok(js.includes(`"${k}"`), `APP_KEPT: ${k}`);
});

test('stages 2–4, app.js: fw.changed() marks Today’s cards, which are asked again as Today is next shown; preload per module where used here', { skip: s24 }, () => {
  const js = own();
  assert.match(js, /changed: \(\) => \{ cardsStale = true; \}/);
  assert.match(js, /onShow\(\) \{ drawLine\(true\); if \(cardsStale\) \{ cardsStale = false; refresh\(\); \} \}/);
  assert.match(js, /const USED = \{ weather: "wx:places", markets: "markets:last", fitness: "fitness:meAt" \};/);
  assert.doesNotMatch(js, /preloadWeather/);
});
