// needs: hub
// InFlite in one window (Today First, spec §3, §14.3): Chats, Weather, Fitness and Markets as pages of the hub
// (ifl.test:8788, the inflite repo's Worker), each fetched from its app's own address (chat., weather., fitness.,
// finance.ifl.test, through the pass-throughs that note every request) and signed in by the site's cookie; each API
// answered at its own host, spoken for as the app and carrying the account's cookie alone (Chat's bearer to Chat alone);
// each page marked as the hub's, with its rules on it; /version and each /<app>/version giving each build from source;
// Chat's hub copy (/_hub/) refused when asked for straight; one window throughout; and two sign-in attempts from two
// addresses through the hub limited each on its own, never as the hub's one. With One roof (stage 1, spec §8.1): Weather
// is a module of InFlite's one page, so /weather/ is the framework's page (Today's, marker content="/", the Worker's
// PAGE_HEADERS), never a page of the hub's; the module's files come from Weather's host with neither cookie nor bearer;
// /weather/sw.js is the retiring worker; Weather's API is still its own, through the hub. (Fitness, Markets and Chats:
// pages of the hub, as before. The roof off, Weather's milestone-1 page: wxhub.mjs.) Stage 2 (spec §5.3, §7): Markets and
// Fitness are modules only where their switch is on (opt-in, ROOF_MARKETS / ROOF_FITNESS "1"): by default (this test's
// `// needs: hub`) /markets/ and /fitness/ are pages of the hub exactly as before, their roof files not found (404,
// no-store, never asked of the app's host) and their own workers the apps'; with `// needs: hub roof-markets roof-fitness`
// (hubserveroof.mjs: the stack's flags are read from the first line of the test run.sh named) each is the framework's
// page, /<app>/sw.js its retiring worker, /<app> a 301 before the key, its module's files from its own host without a
// cookie. /api/hub says { ready, roof, apps }.
import { existsSync, readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { kit } from './lib.mjs';
import { hostCall } from './handback.mjs';

const [,, S, out] = process.argv;
const K = await kit(S, out);
const { ok, one, hubPhone, hostAsk, HUB, errs } = K;
const ROOT = process.env.APP_ROOT || new URL('../../', import.meta.url).pathname;
const IFL = process.env.IFL_ROOT || `${ROOT}/../inflite/`;
const R = await import(`${IFL}/today/src/roof.js`);
// (stage 2's switch, where the inflite repo beside has it (roof.js appsOn): which modules the stack switched on, from the
// flags on the first line of the test run.sh named (process.argv[1]: this file, or hubserveroof.mjs, which imports it), as
// run.sh passes them to hubstack.mjs; a stage-1 Worker has only Weather)
const FLAGS = (/^\/\/ needs: *(.*)/.exec(readFileSync(process.argv[1] || new URL(import.meta.url), 'utf8').split('\n')[0])?.[1] || '').split(/\s+/);
const STAGE2 = typeof R.appsOn === 'function';
const modOn = (app) => STAGE2 && FLAGS.includes(`roof-${app}`) && !FLAGS.includes('roof-off');
const MODS2 = { '/markets/': 'markets', '/fitness/': 'fitness' };
const buildOf = (file, name = 'BUILD') => new RegExp(`const ${name} = "([\\d.]+)"`).exec(readFileSync(file, 'utf8'))[1];
const ORIGINS = { 8792: 'http://chat.ifl.test:8788', 8802: 'http://weather.ifl.test:8788', 8803: 'http://fitness.ifl.test:8788', 8804: 'http://finance.ifl.test:8788', 8791: 'http://account.ifl.test:8788' };
// (what reached each address through its pass-through since this test began: not the stack's own check that they're up)
const T0 = Date.now();
const passed = () => readFileSync(`${S}/hostpass.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.at >= T0);
const b64u = (u) => Buffer.from(u).toString('base64url');

// ---- an account, made at the sign-in page of the tests' site (its cookie covers ifl.test), and Chat signed in to ----
const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const made = await hostCall('auth.ifl.test', '/api/account/signup', { name: 'Hana Okafor', handle: 'hanahub', email: 'hana@example.com', salt: b64u(randomBytes(16)), proof: b64u(randomBytes(32)),
  vault: 'x'.repeat(40), pub: { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y } }, { ip: '10.0.9.1' });
ok(made.s === 201 && made.cookie, 'an account made, signed in on the tests’ site', `${made.s} ${JSON.stringify(made.j)}`);
const cookie = made.cookie, [cname, cvalue] = cookie.split('=');
const word = randomBytes(32).toString('base64url'), code = await hostCall('auth.ifl.test', '/api/account/handback', { app: 'inflight', ask: createHash('sha256').update(word).digest('base64url'), box: 'x'.repeat(48) }, { cookie, ip: '10.0.9.1' });
const chat = code.s === 200 ? await hostCall('chat.ifl.test', '/api/pigeon/handback', { code: code.j.code, verifier: word }, { ip: '10.0.9.1' }) : code;
const token = chat.j?.token;
ok(!!token, 'and Chat signed in to, with its own bearer', `${chat.s} ${JSON.stringify(chat.j).slice(0, 200)}`);

// ---- 1. each app's page through the hub, signed in by the cookie, its API at its own host ----
const ph = await hubPhone('hana', await K.makeKeys(), { cookies: { [cname]: cvalue, theme: 'dark', 'known-device': 'abc123' } });
const { p, ctx, pages } = ph;
await p.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`)));
const navs = []; p.on('framenavigated', (f) => { if (f === p.mainFrame()) navs.push(f.url()); });
const csp = [];
p.on('console', (m) => { if (/CSP violation/.test(m.text())) csp.push(m.text()); });
const meOf = { '/fitness/': '/api/fitness/me', '/markets/': '/api/markets/me' };
for (const [path, api] of Object.entries(meOf)) {
  if (modOn(MODS2[path])) continue;   // (a module here: the framework's page, part 1c)
  const me = p.waitForResponse((r) => new URL(r.url()).pathname === api, { timeout: 30000 }).catch(() => null);
  const res = await p.goto(HUB + path, { waitUntil: 'load' });
  const r = await me, j = r ? await r.json().catch(() => null) : null;
  ok(res.status() === 200 && new URL(p.url()).origin === HUB, `${path}: a page of the hub`, `${res.status()} ${p.url()}`);
  ok(r && r.status() === 200 && j?.signedIn === true && (j.name === 'Hana Okafor' || j.user?.name === 'Hana Okafor' || j.handle === 'hanahub' || j.user?.handle === 'hanahub'),
    `${path}: signed in by the site’s cookie (${api}, through the hub)`, r ? `${r.status()} ${JSON.stringify(j).slice(0, 160)}` : 'never asked');
  const head = await p.evaluate(() => ({ first: document.head.firstElementChild?.outerHTML, manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
    icon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), beacon: !!document.querySelector('script[src*=cloudflareinsights]') }));
  ok(head.first === `<meta name="ifl-hub" content="${path}">`, `${path}: the hub’s marker first in <head>`, head.first);
  ok(head.manifest === '/manifest.webmanifest' && head.icon === '/icon-180.png' && !head.beacon, `${path}: InFlite’s manifest and icon, no beacon`, JSON.stringify(head));
  const h = res.headers();
  ok(h['cache-control'] === 'no-cache, private' && h['x-robots-tag'] === 'noindex' && h['x-content-type-options'] === 'nosniff' && !h.etag && !/cloudflareinsights/.test(h['content-security-policy'] || ''),
    `${path}: the hub’s headers on it`, JSON.stringify([h['cache-control'], h['x-robots-tag'], h['x-content-type-options'], h.etag]));
  await p.screenshot({ path: `${out}/${path.replace(/\//g, '')}.png` });
}
// (Weather's API, still its own at its host through the hub, signed in by the cookie: asked from a page of the hub)
const wxMe = await p.evaluate(async () => { const r = await fetch('/api/weather/me'); return { s: r.status, j: await r.json().catch(() => null) }; });
ok(wxMe.s === 200 && wxMe.j?.signedIn === true, '/api/weather/me through the hub: signed in by the site’s cookie', JSON.stringify(wxMe).slice(0, 160));
// (and every app's API asked from a page of the hub, so each host's own answer is noted below whether or not its page is a
// module here)
for (const api of ['/api/fitness/me', '/api/markets/me']) {
  const a = await p.evaluate(async (u) => { const r = await fetch(u); return { s: r.status, j: await r.json().catch(() => null) }; }, api);
  ok(a.s === 200 && a.j?.signedIn === true, `${api} through the hub, from a page of it: signed in by the site’s cookie`, JSON.stringify(a).slice(0, 160));
}

// ---- 1b. One roof: /weather/ is the framework's page; the module's files from Weather's host; the old worker retired ----
const shared = String(readFileSync(`${IFL}/today/public/_headers`)), sharedCsp = /Content-Security-Policy: (.*)/.exec(shared)[1];
for (const path of ['/weather/', '/weather/index.html', '/weather/?lat=51.5&lon=-0.12&name=London']) {
  const r = await hostAsk('ifl.test:8788', path, { cookie, headers: { 'Sec-Fetch-Site': 'none', 'If-None-Match': '"x"' } });
  ok(r.status === 200 && /<meta name="ifl-hub" content="\/">/.test(r.text) && !/ifl-hub" content="\/weather\//.test(r.text) && /<title>InFlite Today<\/title>/.test(r.text),
    `${path}: the framework’s page (Today’s, marker "/"), never a page of the hub’s`, `${r.status} ${r.text.slice(0, 160)}`);
  const bad = Object.entries(R.PAGE_HEADERS).filter(([k, v]) => r.headers[k.toLowerCase()] !== v).map(([k]) => `${k}: ${r.headers[k.toLowerCase()]}`);
  ok(!bad.length && !r.headers.etag && !r.cookies.length, `${path}: the page’s headers (PAGE_HEADERS), no ETag, no cookie set`, JSON.stringify(bad));
  ok(r.headers['content-security-policy'] === sharedCsp, `${path}: the same CSP as Today’s own page (_headers)`);
}
const pageRow = passed().filter((r) => r.port === 8802 && (r.path === '/' || r.path.startsWith('/?') || r.path === '/index.html'));
ok(!pageRow.length, '/weather/ never asked of Weather’s host', JSON.stringify(pageRow.slice(0, 2)));
const T1 = Date.now();
for (const f of ['roof/weather.js', 'roof/connector.js', 'roof/core.js', 'roof/wxcore.css', 'data.js']) {
  const r = await hostAsk('ifl.test:8788', `/weather/${f}`, { cookie, headers: { Authorization: 'Bearer x-not-for-weather', 'Sec-Fetch-Site': 'same-origin' } });
  ok(r.status === 200 && (/\.css$/.test(f) ? /text\/css/ : /javascript/).test(r.headers['content-type'] || '') && r.headers['x-robots-tag'] === 'noindex' && r.headers['x-content-type-options'] === 'nosniff',
    `/weather/${f}: Weather’s file, through the hub`, `${r.status} ${r.headers['content-type']}`);
}
const modRows = passed().filter((r) => r.at >= T1 && r.port === 8802);
ok(modRows.length === 5 && modRows.every((r) => !r.cookie && !r.auth && r.hub && r.origin === ORIGINS[8802]) && modRows.some((r) => r.path === '/roof/weather.js'),
  'the module’s files from Weather’s host, with neither cookie nor bearer, spoken as Weather with the hub’s key', JSON.stringify(modRows.map((r) => [r.path, r.cookie, r.auth, r.hub])));
const sw = await hostAsk('ifl.test:8788', '/weather/sw.js', { headers: { 'Service-Worker': 'script' } });
ok(sw.status === 200 && sw.text === R.RETIRE_SW && /^text\/javascript/.test(sw.headers['content-type'] || '') && sw.headers['cache-control'] === 'no-cache' && !sw.headers['service-worker-allowed'],
  '/weather/sw.js: the retiring worker, never kept', `${sw.status} ${sw.text.slice(0, 80)}`);
ok(!passed().some((r) => r.at >= T1 && r.port === 8802 && r.path === '/sw.js'), 'and never asked of Weather’s host');
// (in the browser: the framework's page at /weather/, one page, its marker first)
const wres = await p.goto(HUB + '/weather/', { waitUntil: 'load' });
const whead = await p.evaluate(() => document.head.querySelector('meta[name="ifl-hub"]')?.getAttribute('content'));
ok(wres.status() === 200 && whead === '/' && new URL(p.url()).origin === HUB, '/weather/ in the browser: the framework’s page, at the hub', `${wres.status()} ${whead} ${p.url()}`);
await p.screenshot({ path: `${out}/weather.png` });

// ---- 1c. stage 2: Markets and Fitness, each a page of the hub while its switch is off (the default), the framework's
// page while it's on ----
const HOSTPORT = { markets: 8804, fitness: 8803 };
const said = await hostAsk('ifl.test:8788', '/api/hub');
if (STAGE2) {
  const want = { weather: !FLAGS.includes('roof-off') && !FLAGS.includes('roof-off-weather'), markets: modOn('markets'), fitness: modOn('fitness') };
  ok(said.status === 200 && said.json?.roof === want.weather && Object.entries(want).every(([a, v]) => said.json?.apps?.[a] === v) && Object.values(said.json?.apps || {}).every((v) => typeof v === 'boolean'),
    `/api/hub: { ready, roof, apps } with this stack’s switches (${JSON.stringify(want)})`, said.text);
} else ok(said.status === 200 && !('apps' in (said.json || {})), '/api/hub: a stage-1 Worker beside, no apps (Markets and Fitness pages of the hub)', said.text);
for (const [base, app] of Object.entries(MODS2)) {
  const port = HOSTPORT[app], T2 = Date.now(), mine = (since) => passed().filter((r) => r.at >= since && r.port === port);
  const own = `${ROOT}/${app}/roof/${app}.js`, hasMod = existsSync(own);
  if (modOn(app)) {
    for (const path of [base, `${base}index.html`, `${base}?from=today`]) {
      const r = await hostAsk('ifl.test:8788', path, { cookie, headers: { 'Sec-Fetch-Site': 'none', 'If-None-Match': '"x"' } });
      ok(r.status === 200 && /<meta name="ifl-hub" content="\/">/.test(r.text) && !new RegExp(`ifl-hub" content="${base}`).test(r.text) && /<title>InFlite Today<\/title>/.test(r.text),
        `${path} (${app} on): the framework’s page (Today’s, marker "/"), never a page of the hub’s`, `${r.status} ${r.text.slice(0, 160)}`);
      const bad = Object.entries(R.PAGE_HEADERS).filter(([k, v]) => r.headers[k.toLowerCase()] !== v).map(([k]) => k);
      ok(!bad.length && !r.headers.etag && !r.cookies.length, `${path}: the page’s headers (PAGE_HEADERS), no ETag, no cookie set`, JSON.stringify(bad));
    }
    ok(!mine(T2).some((r) => r.path === '/' || r.path.startsWith('/?') || r.path === '/index.html'), `${base} (${app} on) never asked of ${app}’s host`, JSON.stringify(mine(T2).slice(0, 2)));
    const T3 = Date.now();
    const sw = await hostAsk('ifl.test:8788', `${base}sw.js`, { headers: { 'Service-Worker': 'script' } });
    const retire = await R.retireWorker(new Request(`${HUB}${base}sw.js`), app).text();
    ok(sw.status === 200 && sw.text === retire && /markets-app-|fitness-app-/.test(retire) && retire.includes(app === 'markets' ? 'markets-app-' : 'fitness-app-') && /^text\/javascript/.test(sw.headers['content-type'] || '') && sw.headers['cache-control'] === 'no-cache',
      `${base}sw.js (${app} on): its retiring worker (its own caches alone), never kept`, `${sw.status} ${sw.text.slice(0, 100)}`);
    ok(!mine(T3).some((r) => r.path === '/sw.js'), `${base}sw.js never asked of ${app}’s host while it’s a module`);
    const bare = await hostAsk('ifl.test:8788', `${base.slice(0, -1)}?x=1`);
    ok(bare.status === 301 && bare.headers.location === `${HUB}${base}?x=1`, `${base.slice(0, -1)} goes to ${base}`, `${bare.status} ${bare.headers.location}`);
    if (hasMod) {
      const T4 = Date.now();
      const f = await hostAsk('ifl.test:8788', `${base}roof/${app}.js`, { cookie, headers: { Authorization: 'Bearer x-not-for-it', 'Sec-Fetch-Site': 'same-origin' } });
      // (only this check's own request: the browser's page, left on the framework, may ask the host for another module
      // file meanwhile (the connector of each module that's on); none of the module's files ever with a cookie or bearer)
      const rows = mine(T4).filter((r) => r.path === `/roof/${app}.js`), roofRows = mine(T4).filter((r) => r.path.startsWith('/roof/'));
      ok(f.status === 200 && /javascript/.test(f.headers['content-type'] || '') && f.headers['x-content-type-options'] === 'nosniff', `${base}roof/${app}.js (${app} on): its module’s entry, through the hub`, `${f.status} ${f.headers['content-type']}`);
      ok(rows.length === 1 && !rows[0].cookie && !rows[0].auth && rows[0].hub, `and from ${app}’s host, with neither cookie nor bearer, with the hub’s key`, JSON.stringify(rows));
      ok(roofRows.every((r) => !r.cookie && !r.auth), `no module file asked of ${app}’s host with a cookie or bearer`, JSON.stringify(roofRows));
    }
    const pg = await p.goto(HUB + base, { waitUntil: 'load' });
    const marker = await p.evaluate(() => document.head.querySelector('meta[name="ifl-hub"]')?.getAttribute('content'));
    ok(pg.status() === 200 && marker === '/' && new URL(p.url()).origin === HUB, `${base} in the browser (${app} on): the framework’s page, at the hub`, `${pg.status()} ${marker} ${p.url()}`);
    await p.screenshot({ path: `${out}/${app}-roof.png` });
  } else {
    // (off: its module's files are not found, however written, and never asked of its host; its own worker and its bare
    // path are the hub's as before)
    for (const path of [`${base}roof/${app}.js`, `${base}roof/connector.js`, `${base}roof/`, `${base}%72oof/core.js`, `${base}x/..%2Froof/core.js`]) {
      const r = await hostAsk('ifl.test:8788', path, { cookie, headers: { 'Sec-Fetch-Site': 'same-origin' } });
      ok(r.status === 404 && r.headers['cache-control'] === 'no-store' && !r.cookies.length, `${path} (${app} off): not found, never kept`, `${r.status} ${r.headers['cache-control']}`);
    }
    ok(!mine(T2).some((r) => /roof/i.test(decodeURIComponent(r.path))), `${app}’s module files never asked of its host while it’s off`, JSON.stringify(mine(T2).slice(0, 3)));
    const T3 = Date.now();
    const sw = await hostAsk('ifl.test:8788', `${base}sw.js`, { headers: { 'Service-Worker': 'script' } });
    ok(sw.status === 200 && !/retired/.test(sw.text) && mine(T3).some((r) => r.path === '/sw.js'), `${base}sw.js (${app} off): ${app}’s own worker, from its host, as before`, `${sw.status} ${sw.text.slice(0, 80)}`);
    const bare = await hostAsk('ifl.test:8788', `${base.slice(0, -1)}?x=1`);
    ok(bare.status === 301 && bare.headers.location === `${HUB}${base}?x=1`, `${base.slice(0, -1)} goes to ${base}`, `${bare.status} ${bare.headers.location}`);
  }
}

// (Chat's hub copy: its own page with /chats/ for /pigeon/; its API answered at Chat's host, with its bearer)
const res = await p.goto(HUB + '/chats/', { waitUntil: 'load' });
const chatPage = await p.evaluate(() => ({ first: document.head.firstElementChild?.outerHTML, scripts: [...document.scripts].map((s) => s.getAttribute('src')).filter(Boolean), pigeon: /(?<![\w.-])\/pigeon\//.test(document.documentElement.outerHTML) }));
ok(res.status() === 200 && chatPage.first === '<meta name="ifl-hub" content="/chats/">', '/chats/: Chat, a page of the hub', JSON.stringify(chatPage.first));
ok(chatPage.scripts.length && chatPage.scripts.every((s) => /^\/chats\/[\w.-]+\.js\?v=[0-9a-f]{12}$/.test(s)) && !chatPage.pigeon, '/chats/: its scripts at /chats/, stamped, no /pigeon/ path', JSON.stringify(chatPage.scripts));
ok(/frame-ancestors 'self'/.test(res.headers()['content-security-policy'] || '') && res.headers()['x-frame-options'] === 'SAMEORIGIN', '/chats/: framed by the hub’s own pages alone');
const sync = await p.evaluate(async (t) => { const r = await fetch('/api/pigeon/sync', { headers: { Authorization: 'Bearer ' + t } }); return { s: r.status, me: (await r.json().catch(() => ({}))).me?.handle }; }, token);
ok(sync.s === 200 && sync.me === 'hanahub', '/api/pigeon/sync through the hub, with Chat’s bearer: Hana', JSON.stringify(sync));
const anon = await p.evaluate(async () => (await fetch('/api/pigeon/sync')).status);
ok(anon === 401, 'and without it, Chat’s own word: signed out', String(anon));
await p.screenshot({ path: `${out}/chats.png` });

// (stage 3, s3 spec §6.2, S3-D8: Chats' switch off, as here by default (ROOF_CHATS absent): /chats/ and its worker are
// Chat's own as above, its module's files not found, never kept; and Chat's own page at /chats/in/ is its hub copy's
// /_hub/in/, the same page, with its relative files (the brand's inflite.svg, its version) the hub copy's own)
const s3 = await p.evaluate(async () => {
  const get = async (u) => { const r = await fetch(u, { cache: 'no-store' }); const t = await r.text(); return { s: r.status, cc: r.headers.get('cache-control'), ct: r.headers.get('content-type'), t }; };
  const [mod, inPage, svg, ver, ver0, eng, sw] = await Promise.all(['/chats/roof/chats.js', '/chats/in/', '/chats/in/inflite.svg', '/chats/in/version', '/chats/version', '/chats/?engine=1', '/chats/sw.js'].map(get));
  return { mod: [mod.s, mod.cc], inPage: [inPage.s, /<meta name="ifl-hub" content="\/chats\/">/.test(inPage.t), /inflight-version/.test(inPage.t), /(?<![\w.-])\/pigeon\//.test(inPage.t)],
    svg: [svg.s, svg.ct], ver: [ver.s, ver.t === ver0.t], eng: [eng.s, /inflight-version/.test(eng.t)], sw: [sw.s, sw.t] };
});
ok(s3.mod[0] === 404 && s3.mod[1] === 'no-store', 'Chats off: /chats/roof/* not found, never kept', JSON.stringify(s3.mod));
ok(s3.inPage[0] === 200 && s3.inPage[1] && s3.inPage[2] && !s3.inPage[3], '/chats/in/: Chat’s own page from its hub copy, marked as the hub’s, no /pigeon/ path', JSON.stringify(s3.inPage));
ok(s3.svg[0] === 200 && /svg/.test(s3.svg[1] || ''), '/chats/in/inflite.svg: the brand’s picture, as /chats/inflite.svg', JSON.stringify(s3.svg));
ok(s3.ver[0] === 200 && s3.ver[1], '/chats/in/version: Chat’s version', JSON.stringify(s3.ver));
ok(s3.eng[0] === 200 && s3.eng[1], '/chats/?engine=1: Chat’s page', JSON.stringify(s3.eng));
ok(s3.sw[0] === 200 && !(R.retireSw && s3.sw[1] === R.retireSw('chats')) && /inflight-shell/.test(s3.sw[1]), '/chats/sw.js: Chat’s own worker, not the retiring one', String(s3.sw[1]).slice(0, 80));

// (what reached each app's host: spoken as that app; the account's cookie alone, and only on its API; Chat's bearer to Chat alone; every one with the hub's key)
const all = passed(), log = all.filter((r) => r.port !== 8791), today = all.filter((r) => r.port === 8791);
const apiRows = log.filter((r) => r.path.startsWith('/api/')), fileRows = log.filter((r) => !r.path.startsWith('/api/'));
// (and Today's own, to the account's address, beside it: as ever, Today's Origin and the account's cookie alone, no hub key)
ok(today.length && today.every((r) => r.origin === HUB && r.path.startsWith('/api/account/today/') && r.cookies.every((c) => c === 'account') && !r.hub && !r.auth),
  'Today’s own requests: to the account, as Today, with the account’s cookie alone', JSON.stringify(today.filter((r) => r.origin !== HUB || r.hub).slice(0, 2)));
for (const port of [8792, 8802, 8803, 8804]) ok(log.some((r) => r.port === port && r.path.startsWith('/api/')), `the app at :${port} answered its own API`);
ok(apiRows.length && apiRows.every((r) => r.origin === ORIGINS[r.port]), 'every API request spoken as its own app (Origin)', JSON.stringify(apiRows.filter((r) => r.origin !== ORIGINS[r.port]).slice(0, 3)));
ok(apiRows.every((r) => r.cookies.every((c) => c === 'account')) && apiRows.some((r) => r.cookie), 'only the account’s cookie went on (never theme or known-device)', JSON.stringify([...new Set(apiRows.flatMap((r) => r.cookies))]));
ok(fileRows.length && fileRows.every((r) => !r.cookie && !r.auth), 'pages and files: neither cookie nor bearer', JSON.stringify(fileRows.filter((r) => r.cookie || r.auth).slice(0, 3)));
ok(log.filter((r) => r.auth).every((r) => r.port === 8792 && r.path.startsWith('/api/pigeon/')) && log.some((r) => r.auth), 'Chat’s bearer to Chat’s API alone');
ok(log.length && log.every((r) => r.hub), 'every request to an app with the hub’s key', JSON.stringify(log.filter((r) => !r.hub).slice(0, 2)));
ok(log.filter((r) => r.port === 8792 && !r.path.startsWith('/api/')).every((r) => r.path.startsWith('/_hub/')), 'Chat’s pages and files from its hub copy', JSON.stringify(log.filter((r) => r.port === 8792 && !r.path.startsWith('/api/') && !r.path.startsWith('/_hub/')).slice(0, 2)));

// ---- 2. one window ----
ok(pages.length === 1, 'one window throughout: nothing opened beside it', String(pages.length));
const away = navs.filter((u) => { const h = new URL(u).host; return h !== 'ifl.test:8788' && !/^(auth|account)\.ifl\.test:8788$/.test(h); });
ok(!away.length, 'every page stayed at the hub', JSON.stringify(away));
ok(!(await p.evaluate(() => window.__opened.length)), 'nothing asked for a new window');
ok(!csp.length, 'no CSP violation on any hub page', JSON.stringify(csp.slice(0, 3)));

// ---- 3. each build, from source ----
const versions = { '/version': buildOf(`${IFL}/today/public/app.js`), '/chats/version': buildOf(`${ROOT}/pigeon/app.js`, 'APP_VERSION'), '/weather/version': buildOf(`${ROOT}/weather/app.js`),
  '/fitness/version': buildOf(`${ROOT}/fitness/app.js`), '/markets/version': buildOf(`${ROOT}/markets/app.js`) };
for (const [path, build] of Object.entries(versions)) {
  const v = await hostAsk('ifl.test:8788', path, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
  ok(v.status === 200 && v.json?.build === build, `${path}: ${build}, as its source says`, `${v.status} ${v.text.slice(0, 120)}`);
}
// (and as each app's updater asks it, from its page: its relative "version")
const fromPage = await p.evaluate(async () => (await (await fetch('version', { cache: 'no-store' })).json()).build);
ok(fromPage === versions['/chats/version'], 'Chat’s page at /chats/ asks its own version, relative', String(fromPage));

// ---- 4. the hub copy, asked for straight: nothing ----
for (const [host, headers, why] of [['chat.ifl.test:8788', {}, 'at Chat’s address, straight'], ['chat.ifl.test:8788', { 'X-Hub-Ok': '1' }, 'saying it’s the hub'],
  ['chat.ifl.test:8788', { 'X-Hub-Key': 'not-the-key', 'X-Hub-IP': '1.2.3.4' }, 'with a wrong key'], ['localhost:8788', { 'X-Hub-Key': 'hub-test-key' }, 'at localhost, even with the key'],
  ['weather.ifl.test:8788', { 'X-Hub-Key': 'hub-test-key' }, 'at another app’s address'], ['gfg.test:8788', { 'X-Hub-Key': 'hub-test-key' }, 'at the home page']]) {
  for (const path of ['/_hub/', '/_hub/version', '/_hub/app.js']) {
    const r = await hostAsk(host, path, { headers });
    ok(r.status === 404 && !/inflight-version|"build"/.test(r.text), `${path} ${why}: not found`, `${r.status} ${r.text.slice(0, 80)}`);
  }
}
const keyed = await hostAsk('chat.ifl.test:8788', '/_hub/version', { headers: { 'X-Hub-Key': 'hub-test-key' } });
ok(keyed.status === 200 && keyed.json?.build === versions['/chats/version'], 'with the hub’s key, Chat’s hub copy answers', `${keyed.status}`);
// (Chat at its own address, beside it, as before: its own page, never framed, no marker)
const own = await hostAsk('chat.ifl.test:8788', '/');
ok(own.status === 200 && !/ifl-hub/.test(own.text) && own.headers['x-frame-options'] === 'DENY', 'Chat at its own address: as before, unmarked and never framed');

// ---- 5. sign-in attempts through the hub, limited per person ----
const attempt = (ip) => hostAsk('ifl.test:8788', '/api/pigeon/handback', { method: 'POST', origin: HUB, ip, body: { code: 'x'.repeat(43), verifier: 'y'.repeat(43) }, headers: { 'Sec-Fetch-Site': 'same-origin' } });
const first = [];
for (let i = 0; i < 31; i++) first.push((await attempt('203.0.113.21')).status);
const other = await attempt('203.0.113.22');
ok(first.slice(0, 30).every((s) => s !== 429) && first[30] === 429, 'thirty sign-in attempts from one address through the hub, the next held back', first.join(','));
ok(other.status !== 429, 'one from another address through the hub: its own count, not held back', String(other.status));
const keys = one("SELECT key, count FROM pg_limits WHERE key LIKE 'handback-ip:%' ORDER BY key");
ok(keys.some((k) => k.key === 'handback-ip:203.0.113.21' && Number(k.count) === 31) && keys.some((k) => k.key === 'handback-ip:203.0.113.22' && Number(k.count) === 1) && !keys.some((k) => /127\.0\.0\.1|local$/.test(k.key)),
  'counted by each person’s address, none by the hub’s', JSON.stringify(keys));
// (and a browser can't say it's someone else: an address it sends straight to the app's host is its own connection's)
const forged = await hostAsk('chat.ifl.test:8788', '/api/pigeon/handback', { method: 'POST', origin: 'http://chat.ifl.test:8788', body: { code: 'x'.repeat(43), verifier: 'y'.repeat(43) },
  headers: { 'X-Hub-IP': '203.0.113.99', 'X-Hub-Key': 'guess' } });
ok(forged.status === 400 && !one("SELECT key FROM pg_limits WHERE key = 'handback-ip:203.0.113.99'").length, 'X-Hub-IP without the hub’s key: not believed', `${forged.status}`);

// ---- 6. the hub's checks, against the real stack ----
const cross = await hostAsk('ifl.test:8788', '/api/weather/me', { cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } });
ok(cross.status === 403, 'a GET from another site, with the cookie: refused at the hub', String(cross.status));
const write = await hostAsk('ifl.test:8788', '/api/weather/me', { method: 'PUT', cookie, origin: 'http://weather.ifl.test:8788', body: { base: 0, data: {} }, headers: { 'Sec-Fetch-Site': 'same-origin' } });
ok(write.status === 403, 'a write with another Origin: refused at the hub', String(write.status));
const tick = await hostAsk('ifl.test:8788', '/api/pigeon/notify-tick', { method: 'POST', origin: HUB, headers: { Authorization: 'Bearer tick-test-secret', 'Sec-Fetch-Site': 'same-origin' } });
ok(tick.status === 404, 'Chat’s scheduler, through the hub: not found', String(tick.status));
const viaPage = await hostAsk('ifl.test:8788', '/weather/api/weather/me', { cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } });
ok(viaPage.status === 404 && !viaPage.cookies.length, 'an app’s API by way of a page’s path, with the cookie: not found at the hub', `${viaPage.status} ${viaPage.text.slice(0, 80)}`);
const slash = await hostAsk('ifl.test:8788', '/weather?lat=1');
ok(slash.status === 301 && slash.headers.location === `${HUB}/weather/?lat=1`, '/weather goes to /weather/', `${slash.status} ${slash.headers.location}`);
const ready = await hostAsk('ifl.test:8788', '/api/hub');
ok(ready.status === 200 && ready.json?.ready === true, '/api/hub: ready', ready.text);

ok(!errs.filter((e) => /CSP violation/.test(e)).length, 'no CSP violation reported anywhere', JSON.stringify(errs.slice(0, 4)));
console.log('notes (page errors and console errors, for the apps’ own batches):', JSON.stringify(errs.slice(0, 8)));
await ctx.close();
await (await K.hubBrowser()).close();
await K.b.close();
console.log(`FAILS ${K.fails()}`);
process.exit(0);
