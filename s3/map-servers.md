# Map: the server side and the test kit that One roof stage 1 relies on

Reader's map, no edits made. MAIN = `/home/user/up4/tf/georgefarrowgreen` (Pages), IFL = `/home/user/up4/tf/inflite`
(Worker "inflite"), both on `claude/one-roof` (MAIN `ce3e311`, IFL `bbd3cf3`). Line numbers are as of those commits.
Companion maps: `roof/map-today.md` (Today's page, IFL.hub, SWs on the client), `roof/map-fitness.md`, `roof/map-markets.md`.

---------------------------------------------------------------------------------------------------------------------

## 0. In short (what a designer needs first)

1. **The hub can already serve Weather's module files at an inflite.ai path, same-origin, minified, with no MAIN change.**
   `inflite.ai/weather/<file>` → IFL `hub.js forward()` → `weather.inflite.ai/<file>` → MAIN `weatherHost()` →
   `assets(env)` (`_min.js`) → `/min/weather/<file>` while its fingerprint is current. ETag + `If-None-Match` pass through;
   JS/CSS are `private, no-cache` (revalidated each load), `vendor/` a week, PNG/SVG a day. Weather's API is already
   proxied at `/api/weather/*` with the cookie. So stage 1 needs no new proxy route for Weather.
2. **What has to change on the servers is small but sharp:**
   (a) a *document* request for `/weather/` (reload, deep link, notification with no window open) must return the
   framework page, not Weather's full page (IFL `hub.js` page branch, l.123–132);
   (b) Weather's **service worker at scope `inflite.ai/weather/`**, which every phone that opened Weather at the hub in
   milestone 1 now has, answers `/weather/` navigations **cache-first with Weather's old page** (`weather/sw.js` l.55–68).
   It must be retired at the hub (a kill-switch `sw.js` served for `/weather/sw.js` there, and/or the framework
   unregistering that scope), or deep links keep opening the old Weather page;
   (c) the framework page's **CSP and Permissions-Policy** (IFL `today/public/_headers`) must grow to Weather's
   third-party origins (Open-Meteo ×7, BigDataCloud, Nominatim, RainViewer, OpenFreeMap, OSM tiles) and
   `geolocation=(self)`; the unit test `todayfiles.test.mjs` l.60–69 pins "no `https?:` in the CSP" and must change
   deliberately;
   (d) tests: `wxhub.mjs` (Weather's full page at the hub, its SW at `/weather/` scope), parts of `todayshell.mjs`,
   `todayphases.mjs`, `hubserve.mjs`, `todayworker.test.mjs`, `wxsw.test.mjs` assert milestone-1 behaviour (§7).
3. **Connector-shaped contracts already exist on the server**: Cards (`functions/_todaycards.js` + one module per app),
   Send cards (`pigeon/cards.js`, shared by server and browsers), Notifications (`_notify.js` app field, `_devices.js`
   hub fan-out, root `sw.js` `BASES`/`openAt`), Actions (`_todayacts.js` via `/api/act`), Screens (hub paths + sections
   in `_todayday.js` hrefs and IFL `apps.js` `TILES`), Versions (`/version`, `/<app>/version`). **Search has none**:
   only Markets' `GET /api/markets/search` (symbols) and Weather's browser-side geocoding (`weather/data.js
   searchPlaces` → Open-Meteo). Weather's pure modules (`weather/data.js`, `format.js`, `insights.js`, `alerts.js`,
   `codes.js`, `official.js`, `agree.js`) are **already imported by the server** (`functions/_todaywx.js` l.13–19), so
   Weather is already "module + service" shaped for its card.
4. **Keep the URL shapes**: the server already emits hub paths (`/weather/#radar`, `/weather/#warnings`,
   `/weather/?lat=&lon=&name=`, `/fitness/#today`, `/chats/#open=<id>`, `/markets/#today`) in Today's answer, the root
   worker's notification routing and IFL.hub.go. If the framework routes those paths in-page (and the hub serves the
   framework for a `/weather/` document), no server output has to change for stage 1.
5. **Deploy order** (CI and golive assume it): MAIN goes live first, then IFL. A Weather module file added to MAIN is
   inert until IFL's framework loads it; IFL must keep working against both the old and new MAIN for the window
   between (a contract version check is the cheap guard).

---------------------------------------------------------------------------------------------------------------------

## 1. Who answers what (request paths)

### 1.1 inflite.ai (IFL Worker `today/src/index.js`, config `wrangler.toml`)
- `wrangler.toml` `[assets] run_worker_first = ["/api/*", "/version", "/chats", "/chats/*", "/weather", "/weather/*",
  "/fitness", "/fitness/*", "/markets", "/markets/*", "/mail", "/mail/*"]`; everything else is `today/public` assets
  (`not_found_handling = "404-page"`). Vars: `ACCOUNT_ORIGIN`, `CHAT_/WEATHER_/FITNESS_/MARKETS_/MAIL_/AUTH_ORIGIN`;
  secret `HUB_KEY`. Staging `[env.next]` at next.inflite.ai with `TODAY_AS = "https://inflite.ai"`.
- `index.js` `fetch` l.64–80: `/version` → `version()` (reads `BUILD` from assets `/app.js`, l.146–161); hub paths
  (`isHubPath`) → `hub()`; `/mail*` → `mailPage()` (`mailhost.js`); other `/api/*` → `api()`; else `env.ASSETS.fetch`.
- `api()` l.82–132 — Today's own API, a pass-through to `account.inflite.ai/api/account/<route.path>` via
  `account.js ask()`:
  - `ROUTES` l.14–40 (session, handback, logout, today=`today/cards`, prefs, morning(+try), push key/push/move,
    account-link, avatar, act, act/undo, rules, notify, device(s)). `QUERY` allow-list l.43:
    `only, with, device, id, v` — **any new query parameter (e.g. a v3, a search term) must be added here**;
    `MAX_BODY` 64 KiB l.44.
  - checks: `Sec-Fetch-Site` same-origin (or `none` for GET) l.87–88; writes need `X-Inflite: 1` + Origin l.89–93.
  - `X-Today-At` passed on only where `TEST_AT === "1"` l.109–110 (the tests' clock).
  - responses get `SAFE` headers (`no-store`, CSP `default-src 'none'`, CORP same-origin) l.55–60.

### 1.2 The hub, IFL `today/src/hub.js` (264 lines)
| Thing | Where | What |
|---|---|---|
| `PAGES` | l.19–20 | `/chats/`→CHAT (`under: "/_hub/"`), `/weather/`→WEATHER, `/fitness/`→FITNESS, `/markets/`→MARKETS |
| `APIS` | l.21 | `/api/pigeon/`, `/api/weather/`, `/api/fitness/`, `/api/markets/` → app |
| `CAPS` | l.24 | body caps: CHAT 9 MiB, FITNESS 25 MiB+128 KiB, WEATHER 64 KiB, MARKETS 64 KiB |
| `NEVER` | l.26 | server-to-server routes refused: `pigeon/notify-tick`, `weather/tick`, `fitness/garmin-tick`, `fitness/strava/hook`, `markets/tick` |
| `PASS` | l.31 | browser headers forwarded: Content-Type, Accept, If-None-Match, If-Modified-Since, Range, User-Agent, X-Home-Screen |
| `isHubPath` | l.54 | `PAGE_RE` or `API_RE` or `/api/hub` |
| readiness | l.62–88 | `keyed()` (HUB_KEY + all 4 origins), `probe()` asks Chat's `/_hub/version` with hub headers; kept 5 min on 200, 1 min otherwise; `refused` on 404 |
| `hub()` | l.90–133 | `/api/hub` → `{ ready }` (l.93); no key → 503; refused → 503; **API branch** l.105–120 (methods, NEVER on raw and `plainPath`, `Sec-Fetch-Site`, Origin === hub origin on writes) → `forward(…, api:true)`; **page branch** l.123–132: GET/HEAD only, `/weather`→301 `/weather/`, any `/api` under a page path → 404, else `forward(app, (under||"/") + rest)` |
| `forward()` | l.138–168 | builds `hubHeaders`; API only: account cookie (`accountCookie`) and Chat's bearer (Chat only); body only to API, capped (`upTo`); `fetch(VIA + path, redirect: manual)`; 502 on network error |
| `answer()` | l.173–196 | strips Set-Cookie (re-adds only `account=` from APIs), strips Cloudflare beacon from CSP, adds nosniff, deletes `Service-Worker-Allowed` and `Clear-Site-Data`, `X-Robots-Tag: noindex` on non-API, rewrites `Location` via `hubPath`; **HTML only**: drops Content-Length/ETag, `Cache-Control: no-cache, private`, HTMLRewriter removes beacon script, prepends `<meta name="ifl-hub" content="/weather/">`, manifest → `/manifest.webmanifest`, apple-touch-icon → `/icon-180.png`. **Non-HTML keeps the app's own headers (ETag, Cache-Control, CSP, CORP)** |
| `hubPath()` | l.202–218 | app-host URL → hub path (`weather.`/x → `/weather/x`, chat `/_hub/x` → `/chats/x`, email. → `/mail/x`), APIs as they are, own/TODAY_AS origin → path |
| `hubHeaders()` | l.222–230 | `Origin` = the app's own origin, `Sec-Fetch-Site: same-origin`, PASS headers, `X-Hub-Key`, `X-Hub-IP` (CF-Connecting-IP), `X-Hub-Geo` (base64url JSON of cf country/region/city/lat/lon/timezone) |
| `plainPath()` | l.260–264 | the twin of MAIN `_middleware.js plainPath` |

Note the header comment l.13: "Never the assets binding" — serving the framework page for `/weather/` from the hub
breaks that rule on purpose; `env.ASSETS` is available (same `env`), `index.js` already uses it.

### 1.3 MAIN's side of the hub: `functions/_middleware.js` (193 lines)
- `onRequest` l.29: first `hubRequest(ctx0)` (l.171–185): only if any `X-Hub-*` header; with `HUB_KEY` matching
  (`safeEqual`): `CF-Connecting-IP` := `X-Hub-IP`, `X-Hub-Ok: 1`; otherwise every `X-Hub-*` dropped; `X-Hub-Key`
  always dropped; `cf` carried; `next()` re-bound to the new request.
- `PRIVATE` l.188 (dotfiles, `min/`, `workers/`, README, wrangler.toml → 404); odd encodings → 301 to plain path
  (l.40–44, non-API only).
- `/_hub/*` only at Chat's own host with `X-Hub-Ok` (l.53); served l.109–116 via `serveApp(…, { base: "/chats/",
  security: HUB_SECURITY })`.
- host dispatch l.68–73: old georgefarrowgreen.com app hosts → `movedOn`; `isWeather` → `weatherHost(ctx,url)`
  (`_wxapp.js`); `isFitness`, `isMarkets`, `isAccount`/`isAuth`.
- `/.well-known/webauthn` (on georgefarrowgreen.com) lists app origins + `hubOrigins()` (l.56–58).
- `forwardWorker(app, to, prefix)` l.142–163: **an existing pattern for a stand-in service worker** (skipWaiting,
  delete caches, claim, show pushes, open taps elsewhere) — the model for retiring Weather's hub-scope worker (§4.3).

### 1.4 `functions/_sites.js`
- `HOME_SITE`/`APPS_SITE` (tests: `ACCOUNT_SITE=gfg.test`, `APPS_SITE=ifl.test`), `appOrigin()` l.31, `todayOrigin()`
  l.41, `todayLinks()` l.46 (the apps' own origins Today links to, incl. `finance`), `hubOrigins()` l.53 (`HUB_ORIGINS`
  var, exact match), `cfOf(request)` l.63–84 (behind the hub only `X-Hub-Geo`'s six fields, never the Worker's own cf).

### 1.5 Weather's host, `functions/_wxapp.js` (74 lines)
- `isWeather(url, env)` l.21: `WEATHER_HOST` var (tests: `weather.localhost,weather.ifl.test`) or old host.
- `WX_SECURITY` l.29–39: CSP `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' static.cloudflareinsights;
  style-src 'self'; img-src 'self' data: blob: tilecache.rainviewer.com tile.openstreetmap.org tiles.openfreemap.org;
  connect-src 'self' <CONNECT l.23–27>; worker-src 'self'; frame-ancestors 'none'…`, `Permissions-Policy:
  geolocation=(self)`, `X-Frame-Options: DENY`, COOP/CORP same-origin, HSTS preload.
- `serveWeather(res, path)` l.44–59: any HTML other than `/weather/(index.html)?` → 404 (no SPA fallback);
  JS/CSS/HTML/manifest `private, no-cache`; png/svg `public, max-age=86400`; `vendor/*.{m?js,css}` a week.
- `weatherHost(ctx,url)` l.62–74: `/api/*` only `/api/weather/*` → `ctx.next()`; `/version` → `versionResponse`;
  `/weather/...` → 301 to root; else `assets(env).fetch("/weather" + path)` → `serveWeather`.
- (`functions/weather/_middleware.js`: georgefarrowgreen.com/weather → 302 to weather.inflite.ai; preview/local serve
  `/weather/` in place.)

### 1.6 Minified copies, `functions/_min.js` (49 lines)
- `MINIFIED` l.6: `/(pigeon|weather|fitness|markets|account)/(?!vendor/)(dir/)*file.(js|css)` + root `app|styles`;
  `SKIP` `/sw.js`. `assets(env).fetch(req)` l.36–48: GET/HEAD of a MINIFIED path whose source SHA-256 equals
  `min/manifest.json[path]` (checked once per isolate per file, `current()` l.20–34) → `/min/<path>`; else the source.
- `.tools/minify.mjs sources()` l.14–17: `git ls-files 'weather/*.js' …` (git pathspec `*` crosses `/`, so a new
  `weather/<sub>/x.js` is included), minus `sw.js`, `vendor/`, `.min.`; esbuild whitespace+syntax only, **nothing
  renamed** (exports intact). `min.test.mjs` fails on any stale copy; `wxshell.mjs` must run after it (Weather's SW
  fingerprints the minified bytes).
- **Consequence for modules**: any new Weather module file under `weather/` is minified and served minified through
  the hub automatically, provided `node .tools/minify.mjs` (then `node .tools/wxshell.mjs` if it is in Weather's SW
  `SHELL`) is run in the same commit (MAIN CLAUDE.md).

### 1.7 Cache-busting today
- Chat only: `functions/_app.js` `stampImports()` l.73–79 rewrites `from "./x.js"` / `import("./x.js")` to
  `?v=<sha12>`, `serveApp()` l.83–131 stamps the page's refs and serves a stamped file `FOREVER` only when `?v` matches.
- Weather/Fitness/Markets files are **unstamped** (`weather/index.html` l.31–32, 46, 86 use `./styles.css`, `./app.js`,
  `./early.js`, `./boot.js`), so each load revalidates every module through Worker → Pages (one hub hop per file;
  `weather/app.js` alone statically imports 15 modules, l.2–16, and lazily `send.js`, `detail.js`, `settings.js`,
  `radar.js` l.2042, 3915, 3930). Options for the module: (i) accept revalidation (304s), (ii) extend `stampImports`
  to Weather files when `X-Hub-Ok` (immutable caching through the hub, since `answer()` keeps non-HTML headers),
  (iii) copy into IFL like `wxicons.js` (no hop, but drift and two deploys; `todayfiles.test.mjs` l.21 is the
  byte-equality guard pattern).

### 1.8 Versions
- MAIN `functions/_version.js` `SOURCES` l.7–8 (weather: `/weather/app.js` BUILD), `versionResponse` l.24–28
  (`{ app, build, min }`, memo 60 s, `REQUIRED` l.10). At the hub `/weather/version` forwards to weather.'s `/version`
  (hub page branch). IFL `/version` reads Today's BUILD. Both exist for a framework that wants to know the framework
  build and each module's build separately. (The demo's "apps stop having their own version numbers" conflicts with
  both repos' CLAUDE.md BUILD/NEWS rules; until those change, Weather keeps `BUILD`/`NEWS` in `weather/app.js`.)

---------------------------------------------------------------------------------------------------------------------

## 2. Weather's API (what the module talks to)

`functions/api/weather/[[path]].js` (142 lines), routes `ROUTES` l.92–129, dispatch `onRequest` l.131–142:

| Route | Line | Notes for the module |
|---|---|---|
| `GET where` | l.93, fn l.37–43 | rough place from `cfOf` (behind the hub: `X-Hub-Geo`) |
| `GET obs` | l.94–98 | `?lat&lon` (2 dp), limit `wxobs:<ip>` 60/h (`_wxobs.js`) |
| `GET warnings` | l.99–106 | `private, max-age=180` (60 when a source is missing) (`_wxwarn.js`) |
| `GET key` | l.107 | VAPID key |
| `POST subscribe` / `unsubscribe` / `leave` / `move` | l.108–111 | `sameOrigin()` l.46–49 (Origin must equal the request URL's origin — behind the hub that is the weather origin the hub speaks as); `subscribeHere` (`_wxacct.js` l.138) |
| `POST tick` | l.112 | scheduler only; hub `NEVER` |
| `GET/POST email-off` | l.113–126 | email links, own HTML page |
| `GET/PUT me`, `POST account-link`, `POST handback`, sign-out + profile | l.128 → `_wxacct.js ACCOUNT_ROUTES` l.57 | **only where `isWeather(url)`** — behind the hub the URL host is weather's (hub fetches `WEATHER_VIA`), so it works; `PUT me` versioned with 409 on conflict, `MAX_DATA` 48 KiB < `CAPS.WEATHER` 64 KiB |

- Every non-tick request kicks `maybeWxTick` in `waitUntil` (l.135).
- The browser calls are absolute: `weather/account.js` l.8 `API = "/api/weather"`, `weather/app.js` l.938 (`where`),
  l.3151–3202 (key/subscribe/unsubscribe), `weather/data.js` l.249 (warnings), l.554 (obs). At inflite.ai these hit the
  hub's API branch unchanged. Forecast/radar/map/geocoding go **browser → third parties** (CONNECT list), never through
  a server: the framework page's CSP must allow them (§4.4).
- Rate limits are per person behind the hub (`X-Hub-IP` → `CF-Connecting-IP`, `hubRequest`), proven by `hubserve.mjs` §5.

---------------------------------------------------------------------------------------------------------------------

## 3. Today's API (account side) and its per-app parts

- Routes: `functions/_todayapp.js` `TODAY_ROUTES` l.142–350, spread into the account's API at
  `functions/api/account/[[path]].js` l.365. Origin check `fromToday()` l.54 (Origin === `todayOrigin`), writes
  `changeFromToday()` l.60. `todayView()` l.82–98 returns `user`, `prefs`, `morning`, `links` (`todayLinks`), `quiet`,
  `apps.mail`, `hubPush` (Pages var `HUB_PUSH`).
- `GET today/cards` l.175–186: `?only=` (subset, v1 shape), `?v=2` (Today First's day), `?with=morning&device=`;
  limit `today:<id>` 600/h; `momentOf()` l.74 (`X-Today-At` with `TODAY_TEST_AT=1`).
- `functions/_todaycards.js`:
  - `CARD_KEYS` l.16 `["weather","chat","fitness","markets"]`; `make` map inside `cardsFor` l.79–113 → `weatherCard`
    (`_todaywx.js` l.87), `chatCard` (`_todaychat.js`), `fitnessCard` (`_todayfit.js`), `marketsCard` (`_todaymkt.js`).
  - per-card deadline `cardMs` (page 7 s, morning 9 s) l.19–20, `withDeadline` l.30, `Quiet` l.28, `couldnt(key, links)`
    l.39 (error card with `href` from `HEADS` l.38: the apps' own origins), `shareCut` l.42–49, `withSend` l.52 (card
    for Chat held off-JSON), `withForDay` l.57.
  - card shape: `{ state: "ok"|"empty"|"error", href, said, retry?, action?, share?, sendCard? (packed), place?, … }`;
    `sendCard` is `packCard(send)` for page purpose only (l.96–98).
  - v2: `dayFor()` (`_todayday.js`) merged in, `DAY_LIMIT_MS` 3 s, falls back to v1 on failure (l.103–112).
- `functions/_todayday.js` (501 lines): answer adds `phase, since, until, timeline, tops, waiting, upcoming, acts, ride,
  quiet, apps, planning?`; `tops[].buttons[]` `{ do: undo|take|keep|open|answer|sendto, href }` with **hub paths**
  (`/weather/#radar` l.373, 401; `/fitness/#today` l.326, 401; `/fitness/#activities` l.417, 457; `/chats/#open=` l.419;
  `/markets/#today` l.456); `appsOf()` l.472–500 → `apps.weather|fitness|markets` one-line strings (Apps tiles).
- `functions/_todaywx.js` (280 lines): Weather's card from `wx_accts` first place (`kept`), forecast via Open-Meteo out of
  Weather's allowance (`charge()` l.~41, `OM_KEEP`), warnings (`warningsAt`), words from Weather's own modules
  (imports l.13–21 of `weather/*.js` and `fitness/besttime.js`); empty card l.92 (`action` "Add a place in Weather"),
  ok `href` l.95 `${links.weather}/?lat=&lon=&name=`; Send card l.230 `{ v:1, kind:"weather", from:"today", say, snap,
  ref:{ cell:[slat,slon] } }` (0.05° cell, never the place).
- Notifications settings for You: `functions/_todaynotify.js` (`notifyGet`/`notifyPatch` → the account page's
  `notifySettings`/`setNotify`; body parts `{ quiet }, { chat }, { weather }, { markets }, { fitness }, { today }`).
- Acts/rules: `functions/_todayacts.js` (`actTake`, `actUndo`, `rulesGet`, `rulesPut`) via `POST today/act(/undo)`,
  `GET/PUT today/rules`.
- Devices/push: `functions/_devices.js` (`deviceAdd/Drop`, `devicesList/Stop`); with `HUB_PUSH=1` the one hub
  subscription is also written to `pg_push`, `mk_push`, `wx_devs` with `via='hub'` (l.31, 53, 75–77) — Weather's
  notifications already reach the framework's root worker.

**Nothing in Today's API has to change for stage 1** if the framework keeps the hub paths. New connector endpoints
(e.g. per-app search, a v3 day) would need: a `TODAY_ROUTES` entry (MAIN), a `ROUTES` entry and possibly `QUERY`
names in IFL `index.js`, and `todayworker.test.mjs` coverage.

---------------------------------------------------------------------------------------------------------------------

## 4. Serving the Weather module at inflite.ai

### 4.1 Files (works today)
Path: browser `GET inflite.ai/weather/<file>` → hub page branch → `forward(WEATHER, "/<file>")` with hub headers, no
cookie (`hubserve.mjs` asserts "pages and files: neither cookie nor bearer") → `weatherHost` → `assets()` (minified)
→ `serveWeather` headers → hub `answer()` (non-HTML: headers kept, CSP beacon stripped, `X-Robots-Tag: noindex`).
Workers spawned by the module (`new Worker(new URL("./radarwork.js", import.meta.url), {type:"module"})`,
`weather/radar.js` l.155, `radarrain.js` l.35; maplibre's `vendor/maplibre-gl-worker.mjs`) resolve to
`inflite.ai/weather/...`: same origin, `worker-src 'self'` suffices; a worker's own CSP is its response's
(`WX_SECURITY`, after `noBeacon`), which already allows the tiles.
Module-relative imports (`./x.js`) resolve against `import.meta.url`, so they survive the framework's own URL changing
with `pushState`. Avoid document-relative URLs in the module (e.g. `register("./sw.js")` app.js l.957, `fetch('version')`).

### 4.2 Documents: `/weather/` must become the framework's page
- Today: `/weather/`, `/weather/index.html`, `/weather/?lat=…` → Weather's own `index.html` with the hub marker.
- Stage 1: those (and only those: every other Weather path has a file extension) must return Today's `index.html`
  (absolute asset paths, marker `<meta name="ifl-hub" content="/">` at l.5, so it can be served at any path). Change
  point: `hub.js` page branch l.123–132, before `forward()`: `if (page.app === "WEATHER" && /^\/weather\/(index\.html)?$/.test(p))
  → env.ASSETS.fetch(new Request(new URL("/", url), request))` (or decide by `Sec-Fetch-Dest: document`). Keep a var
  (e.g. `ROOF_WEATHER=1`) so it can be rolled back without a deploy of MAIN.
- Headers: `_headers` applies to asset responses; whether it applies to a response obtained through `env.ASSETS.fetch`
  for a *different* path from the Worker must be verified in wrangler dev (the unit test's assets are mocked). Safer:
  the Worker sets the page's CSP/Permissions-Policy itself for this response, from one constant shared with `_headers`.
- Without `HUB_KEY`/ready, `/weather/*` answers 503 today (l.94, 98). Decide whether the document rule runs before the
  key check (framework page, which degrades to `weather.inflite.ai`) — recommended — while files stay behind it.
- `todayworker.test.mjs` l.174–186 asserts `/weather/`, `/weather/?lat=1` never reach the assets: must change.
- `/chats/`, `/fitness/`, `/markets/` keep the milestone-1 page branch unchanged in stage 1.

### 4.3 The old Weather worker at `inflite.ai/weather/` (must not be missed)
- `weather/app.js` l.957 registers `./sw.js` (updateViaCache none); at the hub its scope is `/weather/`
  (`wxhub.mjs` part 7 asserts this). `weather/sw.js` l.55–68: for any GET under its scope (not `/api/`, not
  `/version`), **cache first**; a navigation is answered from the kept `"./"` (Weather's own page), `tinted()`.
- So after stage 1 ships, every phone that opened Weather at the hub gets Weather's old full page for any `/weather/`
  navigation (reload, notification tap with no window, link from another page) until that worker is gone.
- Fix options (combine): (1) hub serves a retiring worker for `inflite.ai/weather/sw.js` (the browser's update check
  fetches it through the hub): `skipWaiting`, delete `wx-*` caches, `registration.unregister()`, `clients.matchAll()`
  → `client.navigate(client.url)` — modelled on MAIN `forwardWorker` (`_middleware.js` l.142); it must only be served
  at the hub, never at weather.inflite.ai (where `weather/sw.js` stays, `wxsw.test.mjs`); (2) the framework page calls
  `navigator.serviceWorker.getRegistrations()` and unregisters any whose scope is `<origin>/weather/`; (3) the
  module never registers a worker of its own at the hub. Caches named `wx-<BUILD>`, `wx-libs-…`, `wx-tint`
  (`weather/sw.js` l.9, 13) live in the shared origin's CacheStorage.
- Root worker (IFL `today/public/sw.js`): `FILES` l.12 and the fetch handler l.35–39 answer only `/` navigations and
  Today's own files — a `/weather/` navigation goes to the network (the hub) — good, but if the framework wants the
  `/weather/` document offline, `fetch` must map it to the `"/"` copy too, and the module's files would need caching
  somewhere (today only Weather's own SW keeps them). `todaysw.test.mjs` pins `today-app-2` and the file list.
- Notifications: root `sw.js` `BASES`/`openAt` l.127–153 map Weather taps to `/weather/?lat=…` / `#warnings`;
  `openIn` l.163–176 first posts `{ ifl: "open", url }` to an open window (the framework can route in-page), else
  `win.navigate`/`openWindow` → the §4.2 document rule. `hubReady()` false → `/#go=<path>`.

### 4.4 CSP and permissions for the one page
- IFL `today/public/_headers` `/*`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:
  blob:; connect-src 'self'; frame-src 'self'; worker-src 'self'; …`, `Permissions-Policy: camera=(), microphone=(),
  geolocation=()`, `X-Frame-Options: DENY`, COOP same-origin.
- A page that never reloads carries one CSP for every module it will load. For Weather it needs `connect-src` + the
  `_wxapp.js` `CONNECT` list (minus cloudflareinsights) and `img-src` + `IMAGES`; `Permissions-Policy:
  geolocation=(self)` (My Location: `weather/app.js` l.935–947, 2930–2933). Not needed: `'wasm-unsafe-eval'`
  (only Weather's own password stretching in `account.js`; sign-in is the framework's). `style-src 'self'` with no
  inline styles: Weather already lives under the same rule.
- Tests pinning the current CSP: `todayfiles.test.mjs` l.60–69 (`!/unsafe-inline|unsafe-eval|https?:/`) and l.71+
  (no inline style/script in `index.html`, `404.html`). Rule 6 is not touched by this (forecast requests carry a place,
  as Weather's do today), but the widened `connect-src` is a reviewable decision; keep it to Weather's list exactly.
- `robots.txt` already disallows `/weather/` (asserted in `todayfiles.test.mjs` l.55).

### 4.5 Storage at the shared origin (servers don't see it, but the kit checks it)
Weather's localStorage/IndexedDB keys already live at inflite.ai in hub mode; `todaykept.test.mjs` requires Today's
sign-out `APP_KEPT` to hold every key Weather's own `signedOut()` clears; `todayshell.mjs` asserts no Markets money or
Chat place in localStorage. A module must not write under `today:*` anything rule 6 forbids.

---------------------------------------------------------------------------------------------------------------------

## 5. Connector-like contracts already present

| Connector part | Exists as | Files / functions |
|---|---|---|
| **Cards** (Today) | one server module per app, uniform shape, deadline per card, error card per app | `_todaycards.js` `CARD_KEYS`, `cardsFor`, `couldnt`, `withDeadline`; `_todaywx.js weatherCard`, `_todaychat.js chatCard`, `_todayfit.js fitnessCard`, `_todaymkt.js marketsCard`; v2 extras `_todayday.js` (`tops`, `apps` via `appsOf`, `upcoming` via `_todaycoming.js upcomingFor`) |
| **Send** | one strict allow-listed card format, pure, shared by browsers and server | `pigeon/cards.js` `KINDS`/`FROMS` l.13, `normCard` l.136, `packCard` l.236, `unpackCard` l.242, `cardWords` l.264, `MAX_PACKED` 6000; Weather builds its own: `weather/send.js` `sendWay` l.91 (`hub.on` → `{ hub:true, words, packed }` for `IFL.hub.send`), server side `_todaywx.js` l.230; Chat's engine sheet in the framework (`IFLChat.share/sendTo`) |
| **Notifications** | per-app senders tag `app`; one hub subscription fanned out; root worker routes taps | `_notify.js` (app field, quiet hours, ride hold), `_wxpush.js`, `_devices.js` (`via='hub'`), IFL `sw.js` `APPS`/`NAME` l.69–70, `BASES` l.127, `openAt` l.129, `openIn` l.163; settings `_todaynotify.js` |
| **Actions** | Today's acts with Undo; open-section links | `_todayacts.js` via `POST /api/act`, `/api/act/undo`; `tops[].buttons[].do` |
| **Screens / sections** | hub paths with hash sections | `_todayday.js` hrefs; IFL `apps.js` `TILES` (weather: `radar`, `warnings`; fitness `today/activities/progress`; markets `today/holdings/news`); `IFL.hub.href(app, section)`; Weather reads `#radar`, `#day=`, `#warnings`, `?lat&lon&name` (asserted in `wxhub.mjs` §1) |
| **Search** | **none shared** | Markets `GET /api/markets/search?q=` (`functions/api/markets/[[path]].js` l.94–98, signed in, 300/h); Weather `weather/data.js searchPlaces` l.264 (browser → Open-Meteo geocoding); Chat search is on-device (E2E). A unified search must be on-device first; sending typed text to an app's server only when scoped to that app (rule 6: never message words or Chat place names to a server or log) |
| **Versions** | per app | `_version.js`, IFL `/version`, `/<app>/version` through the hub |
| **Identity** | one account cookie across `.inflite.ai`; Weather's `GET /api/weather/me` signs in by it at the hub | `_account.js cookieUser`, `_accountapi.js accountRoutes`, `_wxacct.js view()` |

Shared pure modules between app and server (the reason a Weather "connector" can be thin): `functions/_todaywx.js`
imports `weather/data.js` (`shapeForecast`, `forecastQuery`), `format.js`, `insights.js`, `alerts.js` (`briefing`),
`codes.js`, `official.js`, `agree.js`, `fitness/besttime.js`; `imports.test.mjs` guards that the Pages bundle still
loads after any change to those.

---------------------------------------------------------------------------------------------------------------------

## 6. The end-to-end kit

### 6.1 Runner and isolation
- `.tools/tests/run.sh` (59 lines): mocks once (push 8798, mail 8799, giphy 8797, weather 8796, pwned 8795, markets
  8801); per test `server.sh fresh` (pages dev :8788, typing Worker :8790, fresh D1). A test whose **first line is
  `// needs: hub`** (or `hub mail`) also gets `hubstack.mjs` (waits for `$S/hubstack.up`, 150 s); without
  `../inflite/today/src/hub.js` beside, the test is `SKIPPED` (counted as not a pass). Results `$S/results.log`
  (`FAILS 0` = pass), logs `$S/<test>.log`, shots `$S/out/<test>/`. Runs `node --import ./mapopen.mjs <t>.mjs`.
- `server.sh` l.33–39: hub-relevant bindings `HUB_KEY=hub-test-key HUB_ORIGINS=http://ifl.test:8788 HUB_PUSH=1
  TODAY_TEST_AT=1`, hosts `WEATHER_HOST=weather.localhost,weather.ifl.test` (etc.), `APPS_SITE=ifl.test`,
  `ACCOUNT_SITE=gfg.test`, weather stand-ins `WXAPP_URL`, `WEATHER_URL`, `RAINVIEWER_URL`, warnings URLs, `WARN_TTL=0`.
- `hubstack.mjs` (66 lines): host pass-throughs (`mocks/hostpass.mjs`, logs every request to `$S/hostpass.jsonl`
  with port, path, origin, cookie names, auth, hub key) on 8791 account, 8792 chat, 8802 weather, 8803 fitness,
  8804 finance; IFL `wrangler dev` on **:8787** with `VARS` l.24–32 (`*_ORIGIN` = `http://<app>.ifl.test:8788`,
  `*_VIA` = pass-through ports, `ACCOUNT_ORIGIN` = 8791, `HUB_KEY`, `TEST_AT=1`); Mail on 8806 for `mail`.
- `lib.mjs` `kit()`: `hubBrowser()` l.75–77 (`--host-resolver-rules` maps `ifl.test:8788 → 127.0.0.1:8787`,
  `email.ifl.test:8788 → 8806`, `*.ifl.test`/`*.gfg.test` → 127.0.0.1; insecure origins treated secure);
  `hubPhone(name, keys, { zone, path, cookies })` l.82–109 (iPhone UA, standalone stubs, `window.__opened`, push
  stand-in, returns `{ p, ctx, name, pages }`); `hostAsk(host, path, opts)` l.114–127 (Node http with Host; hub at
  :8787); `HUB` = `http://ifl.test:8788`.
- `scratchpad/tf/e2e.sh <MAIN> <state> <tests…>`: `unshare -npmf` own net/pid namespace (`instant/netup.py`), tmpfs over
  every `.wrangler` dir (MAIN, workers/live, IFL, IFL/email), own `WRANGLER_REGISTRY_PATH`, `STATE=tf/state-<name>`;
  **two slots machine-wide** (`flock` on `tf/e2e-slot{1,2}.lock`). Use it for every e2e run (addendum R1: run only the
  tests a brief names).

### 6.2 Tests that touch Today and Weather at the hub (and what each pins)
| Test | Stack | Pins (relevant to stage 1) |
|---|---|---|
| `todayshell.mjs` (665) | **own** IFL wrangler dev :8787 with `ACCOUNT_ORIGIN` → `mocks/todaystub.mjs` :8789 (no hubstack, no HUB_KEY); `/api/hub`, `/chats/*`, `day.css` stood in by `ctx.route` (l.91–98) | tab bar Today·Chats·Apps·You switched in-page with history; engine frame; Apps tiles `['weather','Weather',…,'/weather/']` and chips `/weather/#radar`, `/weather/#warnings` (l.321–331); degraded hrefs to `https://weather.inflite.ai/` (l.488–489); You's writes; sign-out; no Markets money/Chat place in localStorage; cross-fade off/on the hub (l.587–627); axe, CSP, widths |
| `todaypage.mjs` (670) | same stub, no hub key (degraded) | Today v1 cards, links, Edit, morning, menu, no CSP violation |
| `todayphases.mjs` (452) | same stub, Playwright clock | phases; at the hub (IFL.hub stood in) Radar via `IFL.hub.go('/weather/#radar')` (l.330–331), card heads `/weather/…`, Send via `IFL.hub.send`; **Radar click → `waitForURL(BASE + '/weather/#radar')` with `**/weather/**` routed to a stand-in page** (l.343–345); page's own IFL.hub (l.415–431) |
| `hubserve.mjs` (155) `needs: hub` | hubstack | `/weather/`, `/fitness/`, `/markets/` each **a page of the hub** with marker `content="/weather/"` first in head, manifest/icon, `no-cache, private`, noindex, no ETag (l.40–60); `/chats/` stamped scripts; what reached each host (Origin, cookie names, key) (l.76–90); one window; `/weather/version` = MAIN BUILD (l.98–106); `/_hub/` refused straight; per-person limits; hub checks (cross-site 403, foreign Origin 403, `NEVER` 404, `/weather/api/...` 404, `/weather` → 301, `/api/hub` ready) |
| `wxhub.mjs` (494) `needs: hub` | hubstack; Open-Meteo/radar/tiles stood in by `ctx.route` (l.62–82); engine stand-in | Weather's **own page** at `/weather/` with Back first, deep links `#radar`, `#day=`, `#warnings`, `?lat&lon&name`, hashchange, `{ifl:"open"}`; Back/breadcrumb; Settings without Sign Out; Send → `IFL.hub.send`; signed out → `/chats/#signin-start&then=/weather/`; **part 7: Weather's worker active at scope `/weather/`, its caches** (l.335–358); part 8: Weather's own address standalone "InFlite is one app now" card |
| `wxapp.mjs` (1458) | site only (`weather.localhost`) | Weather at its own address, everything; must keep passing (standalone stays) |
| `wxacct.mjs`, `wxshare.mjs`, `wxtest.mjs`, `wxsay.mjs` | site only | Weather's account, Send at own address, server pieces |
| `todayauth`, `todaycards`, `todaymorning`, `todaysnap`, `todayrules` | site only (`hostAsk` / http against `account.ifl.test`) | Today's API contracts (§3); unaffected unless the API changes |
| `hubshare.mjs`, `hubpush.mjs`, `todaymoments.mjs`, `mkthub.mjs`, `ridetime.mjs`, `chats.mjs`, `hubmail.mjs` `needs: hub` | hubstack | Send from Weather's hub page (hubshare), notification taps into hub pages (hubpush, `/weather/` paths), the day end to end (todaymoments: "Radar in the window"), Fitness/Markets/Chats/Mail at the hub — **must keep passing in stage 1** except where they open Weather's old page |
| `updates.mjs` | site | IFL.updates against each app's `/version` |

Unit tests (`node --test .tools/tests/unit/*.test.mjs`; last full run in `tf/i1fix-unit-after.txt`: 1122 pass, 3 fail)
that read IFL: `hubworker` (hub.js with fetch stubbed: PAGES/APIS/NEVER/CAPS, headers, cookies, redirects,
versions, readiness), `hubheaders` (answer() rules per prefix, with MAIN's middleware), `hubnorm` (`hubRequest`,
`cfOf`, `hubOrigins`), `iflhub` (`IFL.hub` in menu.js), `todayworker` (index.js routes, QUERY, TEST_AT, hub paths
never to assets l.174), `todayfiles` (copies byte-equal incl. `wxicons.js` = `weather/icons.js` l.21, `_headers` CSP
l.60–69, robots), `todaysw`/`rootsw` (root worker), `wxsw` (Weather's SW at hub scope vs own address), `wxsend`,
`wxshell` (SUMS/CACHE), `min` (stale copies), `imports` (server bundle loads), `todaykept`, `todaydaypage`,
`mailhost`/`mailframe`. CI (`.github/workflows/tests.yml` l.32–55) clones IFL at the same-named branch, else
`claude/inflite`, and skips IFL-dependent cases where the file isn't there (`todayworker` `tfSkip` l.17–19).

Recent baseline (scratchpad `tf/state-*`): `todayshell`, `todaypage`, `todayphases`, `hubserve`, `wxhub`, `mkthub`,
`chats`, `hubpush`, `hubshare`, `todaymoments` all `FAILS 0`; `ridetime` flaky once (1, then 0 on rerun).

### 6.3 Kit gaps for stage 1
- The stub-based Today tests (`todayshell/todaypage/todayphases`) run IFL **without** `HUB_KEY` and without MAIN, so
  `/weather/*.js` answers 503 there: a framework test that loads the Weather module needs either hubstack
  (`// needs: hub`) or a `ctx.route('**/weather/**')` that serves files from MAIN's `weather/` (and `min/`) on disk.
- No test yet asserts "one page never reloads" across Today → Weather → Back (e.g. a `window.__loaded` marker kept
  across moves, `framenavigated` count on the main frame = 1), nor that module files arrive with no cookie
  (hostpass log already records it), nor the retirement of the `/weather/` worker (set one up as wxhub part 7 does,
  then ship the change, then assert `/weather/#radar` lands on the framework).
- Third-party stand-ins for Weather in the browser are in `wxhub.mjs` l.62–82 and `mocks/wxappdata.mjs`; a new
  framework test can reuse them.

---------------------------------------------------------------------------------------------------------------------

## 7. What would have to change for stage 1 (server and kit), and what must not break

### 7.1 Must change
| # | Where | Change |
|---|---|---|
| S1 | IFL `today/src/hub.js` page branch l.123–132 (+ header comment l.13) | `/weather/` (+`index.html`, any query) document → framework `index.html` from `env.ASSETS`, ideally before the readiness 503 (l.94, 98); flag to roll back |
| S2 | IFL `hub.js` (new) | `/weather/sw.js` at the hub → a retiring worker (unregister, drop `wx-*`, renavigate clients); never touches weather.inflite.ai |
| S3 | IFL `today/public/_headers` (+ the Worker's headers for S1's response) | CSP `connect-src`/`img-src` += Weather's lists; `Permissions-Policy` `geolocation=(self)`; keep everything else |
| S4 | IFL `today/public/sw.js` (optional) | `/weather/` navigation offline → `"/"` copy; decide whether module files are kept, under `today-app-*` or a new cache (bump `SHELL`, update `todaysw.test.mjs`) |
| S5 | MAIN `weather/` | the module entry (screens against the framework's components) + whatever of `app.js` it reuses; standalone `index.html`/`sw.js` keep working; `BUILD`+`NEWS`; `node .tools/minify.mjs`, `node .tools/wxshell.mjs` (if SHELL changes); `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public` if `menu.js/css` change |
| S6 | MAIN `functions/_app.js` / `_wxapp.js` (optional) | stamp Weather's imports when `X-Hub-Ok` for immutable caching through the hub (`stampImports` l.75), or accept per-file revalidation |
| T1 | `wxhub.mjs` | rewrite for the module in the framework: deep links, hashchange, `{ifl:"open"}`, Back, Send, sign-in through the framework, no Weather SW at the hub (invert part 7), standalone part 8 kept |
| T2 | `hubserve.mjs` l.38–60 | `/weather/` is no longer "a page of the hub with marker `/weather/`"; assert framework page + module files via weather host with no cookie; keep `/fitness/`, `/markets/`, `/chats/` |
| T3 | `todayworker.test.mjs` l.174–186, `hubworker.test.mjs`, `hubheaders.test.mjs` | the `/weather/` document now from assets (by design), files still the hub's |
| T4 | `todayfiles.test.mjs` l.60–69 | CSP may name exactly Weather's origins; Permissions-Policy geolocation self |
| T5 | `wxsw.test.mjs`, `todaysw.test.mjs` / `rootsw.test.mjs` | the hub-scope Weather worker retired; root worker's new navigation mapping if S4 |
| T6 | `todayshell.mjs` l.321–331, `todayphases.mjs` l.330–345, 415–431 | hrefs can stay `/weather/#radar`; the "Radar opens /weather/#radar in the same window" check must accept an in-page route (pushState) and a real Weather module instead of the routed stand-in page |
| T7 | new e2e (`// needs: hub`) | one page never reloads: Today → Weather (lazy load, cached after) → Apps → You → back, notification tap in-page, deep-link cold start, degraded mode; add to `suite.txt` |

### 7.2 Must not break
- **Hub security rules** (`hubworker`, `hubheaders`, `hubnorm`, `hubserve` §4–6): APIs only from same-origin pages,
  Origin on writes, `NEVER` routes, `plainPath` climb-outs, body caps, cookie allow-list (`account=` only, API only),
  Chat's bearer to Chat only, `X-Hub-Key` only from the Worker, per-person limits via `X-Hub-IP`, `cfOf` via
  `X-Hub-Geo`, noindex, beacon stripped, `Service-Worker-Allowed`/`Clear-Site-Data` dropped.
- **Chats, Fitness, Markets as milestone-1 hub pages** (`chats`, `ridetime`, `mkthub`, `hubshare`, `hubpush`) and Mail
  framed at `/mail/` (`hubmail`), reached from the framework by a full page load.
- **Weather at weather.inflite.ai** standalone (`wxapp`, `wxacct`, `wxshare`, `wxsw` own-address cases, its `sw.js`
  SUMS/CACHE via `wxshell`), incl. part 8 of `wxhub` ("InFlite is one app now" card).
- **Today's API contracts** (`todayauth`, `todaycards`, `todaymorning`, `todayrules`, `todaysnap`) and the v2 hub
  paths in its answer; `/version` and `/<app>/version`.
- **Degraded mode**: `/api/hub` not ready → Today links to the apps' own addresses (`todayshell` l.488–489,
  `todaypage`); a rollback must be a var flip (`hub-off.yml`, `hub-key.yml`, `hub-stage.yml` in MAIN workflows; IFL
  `[env.next]` staging at next.inflite.ai with `TODAY_AS`).
- **Rule 6**: nothing of a message, a Chat place name or a Markets amount in a URL, server, push, `today:*` storage or
  log (the hub logs only `console.error("hub", app, message)`, l.164; the module's requests must not add query
  strings carrying them; a unified search must stay on-device for Chat).
- **Notifications through the one root worker** (`hubpush`, `rootsw`): `via='hub'` rows, taps opening in the window.
- **Minify discipline** (`min.test.mjs`), **BUILD/NEWS** per changed app (Weather `weather/app.js`, Today
  `today/public/app.js`; Mail if touched), **Today's copies** (`iflmenu.mjs`, `signin.mjs`, `wxicons.js` byte-equal).

### 7.3 Order of going live (as the existing release practice has it)
1. MAIN to `main` with the Weather module files (inert: the live framework doesn't load them; Weather's hub page and
   standalone page unchanged). Unit tests + `wxapp`, `wxhub` (old), `hubserve` green.
2. IFL to its live branches (`claude/inflite` + `dist7t`, per earlier releases) with S1–S4 behind a var; staging first
   at next.inflite.ai (`npx wrangler deploy --env next`, HUB_ORIGINS already lists it).
3. Flip the var on production; rollback = flip back (Weather's hub page returns; the retired `/weather/` worker simply
   re-registers from Weather's old page on its next open).
