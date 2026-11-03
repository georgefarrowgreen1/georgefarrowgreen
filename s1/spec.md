# One roof, stage 1: the build spec (revised after the two critiques)

MAIN = `/home/user/up4/tf/georgefarrowgreen` (Pages, `claude/one-roof` at `ce3e311`). IFL = `/home/user/up4/tf/inflite`
(the Worker `inflite` at inflite.ai, and Mail's Worker, `claude/one-roof` at `bbd3cf3`). Paths are relative to the repo
named. Function names come first; line numbers drift.

Read with this: the demo `superapp/roof-src.html` (its phone prototype, "How it would be built", "Embedded, or
connectors?"), the maps in this folder (`map-today.md`, `map-weather-client.md`, `map-servers.md`, `map-design.md`),
both repos' `.claude/CLAUDE.md`, and milestone 1's `tf/spec.md` + `tf/addendum.md` (A1, A4–A6: the hub is on at
inflite.ai, `HUB_PUSH=1`). Where this spec and a map disagree, this spec wins. `roof/addendum.md` wins over this spec.

**Revision.** The first draft is kept as `spec-v1.md`. Every BLOCKING and IMPORTANT point of `critique-risk.md` (RB1–RB7,
RI1–RI20) and `critique-ux.md` (UB1–UB6, UI1–UI14) is fixed in the section named in brackets where it is used, e.g.
"[RB1]". Points answered differently from the critique's suggestion, and why, are in §13 Replies.

---

## 0. In short

- **Stage 1 = the framework, with Today, Apps and You on it, and Weather as its first module.** inflite.ai becomes one
  page that never reloads between Today, Apps, You and Weather: one header (Back or your photo, app name, title, the
  app's sections as a switcher, Search), one tab bar (Today · Chats · Apps · You), one sheet, one toast, one search,
  one Send, one set of tokens with each app's colour as accent. Weather's screens (Now · 16 Days · Radar · Warnings)
  are drawn with the framework's pieces, on Weather's own data code, talking to Weather's own server.
- **What stage 1 does not yet unify, said plainly [UI10, UI11]:** search covers Today, Apps, You and Weather (not Chats,
  Fitness, Markets or Mail); Chats, Fitness, Markets and Mail keep their own pages, headers and menus until their stage.
- **Three layers, as agreed.** (1) Framework: IFL `today/public/roof/*` plus Today's host page. (2) Modules: Weather's in
  MAIN `weather/roof/*`, beside Weather, served same-origin through the hub at `inflite.ai/weather/roof/*`, loaded with
  `import()` on first open and kept. (3) Services: unchanged. Weather's connector is a small client file
  (`weather/roof/connector.js`) over **existing** endpoints; stage 1 adds **no server endpoint** anywhere.
- **Chats, Fitness, Markets and Mail stay exactly as they are** (milestone-1 hub pages, Mail framed). The framework
  links to them with a normal navigation, writing the breadcrumb, so their Back returns to the framework screen you left,
  with its scroll [UI7].
- **weather.inflite.ai is unchanged.** `weather/app.js` is not edited in stage 1 except `BUILD`/`NEWS`; the module ports
  what it needs and a parity test keeps the two from drifting. `radar.js`, `mapgl.js`, `mapleaf.js` get small options
  whose defaults keep standalone identical.
- **It ships behind the hub key and has its own off switch.** With the hub explicitly not ready, everything is today's
  degraded mode. With the hub ready, `/weather/` is the framework unless the Worker secret `ROOF_OFF` is `"1"`
  (`roof.yml state=off`, seconds, no build), which brings back milestone 1's Weather page at `/weather/` and makes the
  hub refuse the module's files, so pages already open fall back too [RB6].
- **Build:** B0 (contracts, serial) → wave 1: FW framework, SV server/worker/switch, WX Weather core, Q acceptance
  tests → wave 2: TD Today/Apps/You, WV Weather views, WS Weather settings → I integration (versions Today 1.10,
  Weather 1.65, minify, wxshell, suite, full e2e, go-live).

---

## 1. Decisions

Each: what we do, what we rejected, why. Numbered so batches and reviews can cite them.

**D1. Where module code lives: in MAIN, beside its app (`weather/roof/`), served through the hub at
`inflite.ai/weather/roof/*`.**
- Rejected: copying modules into IFL (two copies of Weather's data code, drift, two deploys of one app, the
  `wxicons.js` byte-equality pain times twenty); a third repo or CDN (new deploy path, new origin, CSP).
- Why: the hub already serves `/weather/<file>` same-origin, minified when fresh, with ETags, no cookie
  (`map-servers` §0.1, §4.1). Weather's pure modules are already imported by its server (`_todaywx.js`), so one copy
  feeds the app, the server and the module. Weather keeps one BUILD and one owner. `MINIFIED` and `minify.mjs` already
  cover `weather/roof/*`; `.tools/` isn't served.

**D2. How modules load: `import("/weather/roof/weather.js")` on first open, kept for the life of the page.**
- The module's CSS (`REGISTRY.weather.css`: `weather.css`, `wxcore.css`, `wxsettings.css`, `radar.css`) is added as
  `<link rel=stylesheet>` and awaited before mount (no flash) [RB5b].
- **Static graph and lazy files [RB7].** The module's static import graph is exactly: its own files (§7.1) plus 14 reused
  Weather files (`data, insights, format, codes, climate, sky, skill, solar, official, agree, account, send, charts,
  icons`). Everything else is imported lazily and **only through `fw.lazy(() => import(…))`** (D21): the radar stack
  (`../radar.js` and what it imports, maplibre/Leaflet in `vendor/`) on first Radar, and `../rainmap.js` +
  `../radarrain.js` for the radar-rain blend of the next hour (core.js's `radarRain` hook; until they load, or offline,
  the next hour is the model's own, as standalone does with no radar frames). `connector.files` lists the static graph
  plus the CSS (30 files); `roofcontract` walks the graph and fails if any statically imported file is missing from it.
- **Modulepreload [RI5].** The framework imports `connector.js` (small, no imports) at idle after Today's first paint
  when hub and roof are known on, and then adds `<link rel=modulepreload>` for `connector.files` if
  `localStorage["wx:places"]` exists (Weather used here before); otherwise on `pointerdown`/`focus` of any link to
  `/weather/`. **On a `/weather/` boot** it starts `connector.js` and the preloads at once, in parallel with
  `/api/session` and `/api/hub` (the document itself is the Worker's evidence that roof was on: D23). Today's own static
  `roof/*.js` are `<link rel=modulepreload>`ed in `index.html`.
- Kept, not torn down: leaving Weather hides its screen (`hidden` + `inert`) and calls `instance.hide()`; coming back
  calls `show(route)` with state intact. `unmount()` runs on sign-out and when roof turns off (D14). Exception: the
  radar map is destroyed after Radar has been out of sight for 5 minutes and rebuilt on its next show [RI11].
- Rejected: unmount on every leave (radar.js and app-derived code don't tear down cleanly, `map-weather-client` §8.4;
  slower re-open); iframes (a second document, second menus: what the demo says to leave behind).
- Cache-busting: none by query. Weather's files are `private, no-cache` (revalidated, 304s) so a fresh page gets
  current files; skew inside a long-lived page is handled by D21.

**D3. The framework API modules get (`fw`)**, fixed in §5.2: components (`fw.ui`), header control for its own screen
(`fw.header.set`), navigation (`fw.nav.go/back/section/href`), sheets (`fw.sheet`), toasts (`fw.toast`), Send
(`fw.send`, `fw.sendButton`), search registration (`fw.search.provide`), session (`fw.session`: user, `lost()`),
visibility/theme/motion, `fw.fill` (a screen that fills the window, Radar), `fw.lazy`/`fw.stale` (D21), and the
module's screen element. **No `fw.fetch`**: modules call their own `/api/<app>/*` same-origin exactly as at the hub
today (the hub adds the cookie). A 401 or `{signedIn:false}` is reported with `await fw.session.lost()`, which **checks
the session before signing anyone out** [RI4]: it asks `/api/session` once (debounced, shared by all callers for 30 s)
and calls `signedOutNow()` only if the session confirms you're signed out; it resolves `true` then, else `false`, and the
module shows its own "Couldn’t sync with your account" line. Rejected: a framework fetch wrapper (Weather's data code
has its own fetch with timeouts and storage; wrapping it buys nothing and touches reused code).

**D4. The module contract (v1)**, §5.1: exports `CONTRACT = 1`, `BUILD`, `NEWS`, `SECTIONS`, `mount(root, fw) →
Promise<instance>`; instance `{ show(route, hint), hide(), back(), busy(), sendable(), unmount() }`. Deep links are
parsed by the framework's router with the registry's sections/aliases; the module receives the parsed route plus the raw
query, and `hint` (the zoom's card data, §3.7). Back: the framework asks `instance.back()` first (true = handled). State
restore: the module keeps its own state (kept alive); the framework restores window scroll per history entry and per
section.

**D5. The connector contract (v1)**, §6: a client part per app (`connector.js`: `shares`, `sections`, `aliases`,
`files`, `mini(answer)`, `search(q)`) and a server part, which for every app in stage 1 is **existing** endpoints
(Cards: `/api/today?v=2`; Notifications: `_notify.js`/`_wxpush.js` + `_devices.js` fan-out + root `sw.js`, configured
through `/api/notify`; Actions: deep links and `/api/act`; Screens: hub paths; Search: on device only). Non-module apps
(Chats, Fitness, Markets, Mail) get static descriptors in the framework (`roof/connectors.js`), so You and Apps treat all
five alike, each saying only what it really shares [UI11].

**D6. Routing: real URLs, history API, the old vocabulary kept as the canonical form.**
- `/` Today, `/#apps` Apps, `/#you` You (as now: they are in every app's copied tab bar, breadcrumbs, Mail's host
  `{ifl:"back"}`, server output). **Tab routes carry an optional target [RI8]:** `/#you=<id>` opens You at the section or
  sheet `<id>` (`notify`, `quiet`, `rules`, `phone`, `apps`, `account`, `notify-weather`: You's Weather Notifications
  sheet, §4.3).
- `/weather/` Now, `/weather/#days`, `/weather/#radar`, `/weather/#warnings`, `/weather/#day=YYYY-MM-DD` (16 Days + that
  day's sheet), `/weather/#settings` or `#settings=<page>` (Now + Weather Settings, at that page),
  `/weather/?lat=&lon=&name=` (that place), and the two combined (`/weather/?lat=…&name=…#warnings`: that place, that
  section; Today's warning chip uses it, §4.4).
- **The address is tidied after a deep link [RB5d, UB5b]:** once `instance.show(route)` has settled, the frame replaces
  the URL with the section's own (`format({ app, section })`: no query, no sheet key), so `?lat…&name=…`, `#day=…` and
  `#settings…` never stay in the address or in history. Sheets opened by a tap write no URL and push no history entry
  (D22).
- Rejected: `/apps` and `/you` paths (no user gain; every hub page's tab bar still links `/#apps`); path segments
  `/weather/radar` (clash with files like `/weather/radar.js`, and new hub rules); a hash router at `/` only (old
  `/weather/...` links from notifications, Today's answer and other pages must keep working without reloading twice).
- Sections switch with `replaceState` (Back leaves the app, as the demo does); tabs and opening an app `pushState`.
- **No server output changes**: the server already emits `/weather/#radar`, `/weather/?lat=…`, `/weather/#warnings`
  (`_todayday.js`, `_todaywx.js`, root `sw.js openAt`).

**D7. `/weather/` must answer the framework.** The hub's page branch returns Today's `index.html` (from `env.ASSETS`)
for `GET|HEAD /weather/` and `/weather/index.html` (any query) **when roof is on**, before the hub-key check, with the
page headers set by the Worker. Every other `/weather/*` path (files, `version`) is forwarded as now, except that with
`ROOF_OFF=1` the hub answers 404 for `/weather/roof/*` [RB6b]. Rejected: deciding by `Sec-Fetch-Dest` (absent on some
requests; path-only is deterministic and testable).

**D8. During stage 1, Chats, Fitness, Markets and Mail are untouched.** Links from the framework (tab bar Chats, Apps
tiles, Today's cards and rows, search results) navigate normally; the shared block's capture-phase click listener
writes `ifl-crumb` = the framework's current path+hash; their `IFL.hub.back()` returns there and the framework renders
that route on load, with its scroll (D20). Their tab bars link `/`, `/#apps`, `/#you` (full load into the framework). No
change in MAIN `pigeon/`, `fitness/`, `markets/`, IFL `email/`, `mailhost.*`, or `.tools/inflite/menu.js|css`.

**D9. Standalone weather.inflite.ai is unchanged in stage 1.** `weather/app.js`, `index.html`, `sw.js`, `styles.css`,
`settings.js`, `detail.js` keep their code (only `BUILD`/`NEWS`, and `sw.js`/`index.html` SUMS by wxshell). `radar.js`,
`mapgl.js`, `mapleaf.js` gain options whose defaults keep standalone identical (§7.1, proven by `wxapp`, `wxradar`). The
module ports state/settings/places/sync logic into `weather/roof/core.js` and `sync.js` with the same storage keys and
shapes, guarded by `roofwxcore.test.mjs` (§10), which extracts the same-named pure functions from `weather/app.js`
and checks identical results. Rejected: refactoring `app.js` into shared `wxstate.js`/`wxviews.js` now (touches the
live standalone app's every path for no stage-1 user gain). Stage 2+ moves standalone onto the module and deletes the
port.

**D10. The service worker.** The root worker stays the only one at inflite.ai for the framework. It (a) answers
`/weather/` navigations network-first with the kept `/` as the offline fallback (never writing a `/weather/` response
under `/`), (b) keeps the module's files in `roof-weather-<BUILD>` when the page asks (`{ifl:"keep"}`), all or nothing,
and serves them network-first with that cache as fallback, (c) routes notification taps in-page through a new
`{ifl:"route"}` message to framework windows. **Weather's old worker at scope `/weather/` is retired** two ways: the page
unregisters it as soon as `/api/hub` says roof is on, signed in or not [RI10], and the hub serves a retiring
`/weather/sw.js` while roof is on (§8.4).

**D11. Offline [RB1].** Today opens offline as now: signed in, from the kept session, **only in standalone (Home
Screen) mode**, as `load()` already does (`e.status === 0 && standalone()`); in a browser tab offline shows the way in, as
now. Weather opens offline under the same condition, if it was opened online once since the last Weather release:
framework from `/`'s copy, module from `roof-weather-*`, forecast from Weather's kept `wx:<cell>` records. An offline
`/weather/` boot never leaves inflite.ai (D23). Radar says "Radar needs a connection". Rejected: caching maplibre
(1.1 MB for a screen that's useless offline).

**D12. Sign-in.** One framework sign-in (Today's session; Chat-first trip at the hub). Signed out at any framework
route (including `/weather/...`) shows InFlite's way in (`#out`), whose sign-in returns to that route
(`/chats/#signin-start&then=<encodeURIComponent(path+hash)>`, in both the `#signin` href written by `hubSays` and the
click handler, which today hard-code `then=/` [RI15]). Degraded sign-in keeps `goToAccount()`'s `back: origin + "/"` (a
degraded `/weather/` has already replaced itself). The module never signs in, never draws account UI; Weather's account
sync (`/api/weather/me`) runs on the shared cookie, and a 401 there goes through `fw.session.lost()` (D3). Rejected: a
signed-out Weather inside the framework (a second, signed-out shell mode for one app). George, Q2 (§12).

**D13. Degraded mode (hub explicitly not ready)** stays exactly milestone 1's A1: the framework runs Today/Apps/You;
every Weather link is Weather's own address (`IFL.hub.go/href` already do this when degraded); a `/weather/...` document
that reaches the framework while the hub is **explicitly** not ready (D23) does `location.replace` to Weather's own
address (same path, query, hash). The module is never imported when degraded (its files and API need the hub).

**D14. Roof flag.** `GET /api/hub` → `{ ready, roof }`, `roof = env.ROOF_OFF !== "1"`. The client reads
**`roof = j.roof === true`** (a missing field, as from a 1.09 Worker or an old stub, means off: milestone 1's Weather page,
the safe default) [RI9] and keeps it with `ifl-hub-ready` in `sessionStorage` as `ifl-roof` (`"1"|"0"`; a kept
`ifl-hub-ready` without `ifl-roof` means ask again). In-page Weather iff `ready && roof`. **The page asks again** when it
becomes visible (at most every 5 minutes) and right before `loadModule` [RB6b]. On a change to `roof:false`: the Weather
instance is unmounted, links to `/weather/` become normal navigations (the hub serves milestone 1's page), and if the
Weather screen is showing, the page does `location.replace(location.pathname + location.hash)` once (marker
`sessionStorage["ifl-roof-bounce"] = "1"`, never a path or a query [RI7]). A framework page that boots at `/weather/`
with `roof:false` and the marker set goes to Weather's own address (no loop); without the marker it sets it and replaces
the location once.

**D15. Versions.** House rules hold: Today `BUILD` 1.09 → 1.10 (`today/public/app.js`), Weather `BUILD` 1.64 → 1.65
(`weather/app.js`), each with `NEWS`. The module re-exports Weather's numbers as constants in `weather/roof/weather.js`
(`BUILD`, `NEWS`), pinned equal to `weather/app.js`'s by `roofcontract.test.mjs`. On first mount the framework calls
`IFL.built("weather", BUILD, NEWS)` (the "Weather updated" note, once per build). A Weather release reaching a page
already open is D21. Today's own updater is unchanged (`/version`, `IFL.updates`, its busy check now `F.busy()`).
Rejected: one InFlite release number for everything (the demo's "What it costs"): both CLAUDE.md files require per-app
BUILD/NEWS; George, Q7. Rejected: calling `IFL.update()` for Weather (it only applies Today's own pending build, and
skips the quiet checks when it does) [RB2, UI13].

**D16. Privacy rule 6.** Search is on device only: the query never leaves the page (no request carries it, not to an
app's server, not to Open-Meteo), never in a URL, `history.state`, storage or a log; results are built with
`textContent`. Worldwide place search stays inside Weather's Places sheet ("Find a place"), as it is in Weather today.
The module writes only Weather's existing `wx:*`/`skill4:*`/`clim*`/`radar*:` keys, never `today:*`; the framework adds
only `sessionStorage["ifl-roof"]` (`"1"|"0"`), `["ifl-roof-bounce"]` (`"1"`) and `["ifl-roof-y"]` (`{ p: <formatted
route>, y: <number> }`: a formatted route never has a query, so never a place name), and writes `["ifl-here:today"]` in
the shared updater's own format. Markets minis show % only. Chat stays end-to-end encrypted: Send is Chat's engine sheet
(D17); search's People are names already in Today's answer, never words.

**D17. Send.** Stage 1 keeps Chat's engine sheet (`IFL.hub.send` → `IFLChat.share`, end-to-end encrypted in its own
frame) as the one Send sheet. `fw.send({ words, packed, what })` is a thin wrapper (degraded → Chat's own address, as
now). Rejected: the framework drawing the friends list (needs a new `IFLChat` API in Chat: stage 3, with Chats).

**D18. Look.** Framework tokens = Today's `app.css` tokens plus the accent sets of `map-design` §3.2 (`--acc`,
`--acc-ink`, `--acc-fill`, `--on-acc`, `--acc-wash`) on `html[data-app]`. InFlite's own accent: indigo `#5a4fe0`
(the demo's), George Q1. The accent colours the header crumb, the section switcher, primary buttons, segmented
controls and sheets. **The tab bar keeps menu.css's own colours (`--ifl-tab-on`) in stage 1** so it is the same bar on
Chats' page and in the framework; the framework's sliding pill uses that colour and turns off menu.css's static pill
where it is present [UI2]. The tab bar moves to the accent in stage 3, when Chats is a module. Weather's Now hero is the
same component as Today's weather card (`.tcard.wx.wx-sk-<sky>`, white on its sky) so the card opens into what it looks
like; everything else in Weather is framework glass with Weather's accent. The sky page, per-sky glass, Weather's top
bar and its sheet chrome are not carried.

**D19. Gestures.** No section swipes and no place swipe in stage 1 (they fight the hour strip, the radar map and
Safari's own back; `map-design` §10 #5). Places switch from the title ▾, whose sheet lists your places as one-tap rows at
the top with the current one ticked [UI8]. Edge-swipe Back only in standalone (Home Screen) mode, from the left 20 px,
never starting inside `[data-no-edge]` (the radar map).

**D20. The scroller is the window.** One screen visible at a time; hidden screens `hidden` + `inert`. The frame sets
`history.scrollRestoration = "manual"` [RI2] and keeps scroll per history entry and per app section in memory. Before
the page leaves (`pagehide`) it writes `sessionStorage["ifl-roof-y"]` for the current route, and a boot at that same
route restores it after first paint (the Chats/Fitness/Markets round trip, [UI7]). The page stays bfcache-eligible (no
`unload` listeners; nothing held open on `pagehide`); on `pageshow` with `persisted` it refreshes the day and asks
`/api/hub` and the versions again. A screen that must fill the window (Radar) calls `fw.fill(true)`: the frame sets
`html.ifl-fill` (the root doesn't scroll, the header is held compact, `--p: 1`), cleared when the section or screen
changes [UB1]. Keeps iOS status-bar tap-to-top and Safari's toolbar collapse; Weather's radar already listens to window
scroll.

**D21. A Weather release reaching a page already open [RB2, UI13].** `modules.js watchVersion` asks `/weather/version`
when the page becomes visible (at most every 10 minutes) while Weather is loaded. A different build sets `F.stale`. From
then on:
- **No lazy file joins the old module.** Every dynamic import in the module goes through `fw.lazy(fn)`: while stale it
  does not run `fn`; it reloads the page at the current route instead (Radar first tapped → the page reloads at
  `/weather/#radar`) and returns a promise that never settles. `roofcontract` fails on any `import(` in
  `weather/roof/*.js` outside `fw.lazy(`.
- **Otherwise the reload waits for a boundary**, never while Weather is on screen and in use: (a) the page comes back
  visible after ≥ 60 s hidden (the shared updater's own "fresh" rule) and no sheet is open; or (b) Weather is opened from
  another framework screen (the navigation becomes `location.assign(target)` instead of an in-page route).
- The reload writes `sessionStorage["ifl-here:today"] = JSON.stringify({ at: opts.save(), t: Date.now() })` (the format
  `IFL.here` reads; `opts.save` is Today's own, §4.1) then `location.reload()`; the URL already holds the route. The
  "Weather updated" note comes from `IFL.built` on the next mount, as D15.

**D22. Sheets and history [RI3, UB5].** Sheets opened by a tap push no history entry and write no URL. Any route change
(`popstate`, any `F.nav.go`, a `{ifl:"route"}` from the worker, a tab tap) first closes every framework sheet (not
Chat's engine dialog, which is Chat's). Android's back button closes the top `<dialog>` through the platform's
CloseWatcher where supported; where it isn't, the `popstate` rule still leaves no sheet over the wrong screen.

**D23. Hub state is three-way [RB1].** `hubReady()` answers `"yes"` (`{ready:true}`), `"no"` (an explicit
`{ready:false}`, a 404 or a 503) or `"unknown"` (no answer in 1.5 s, or a network error). Only `"yes"`/`"no"` are kept in
`sessionStorage`. At `/` an `"unknown"` behaves as milestone 1 (degraded links until a later answer). **On a `/weather/`
boot, `"unknown"` counts as ready with roof on** (the document is the framework only because the Worker served it with
roof on, or because the root worker served the kept `/` offline): the module either loads (network or `roof-weather-*`)
or shows its error state, whose "Open Weather on Its Own" is the way out. Nothing on a `/weather/` boot ever starts a
navigation to weather.inflite.ai except an explicit `"no"` (D13) or the D14 bounce. This matches the root worker, which
already takes "no word in two seconds" as yes.

**D24. Your photo opens InFlite's menu, as on every other page [UI1].** On tab screens the header's leading photo opens
`IFL.menu` as Today does now (`openMenu`): rows as now (Notifications → You, Morning Notification, Edit Today) plus
"Connected Apps" (→ `/#you=apps`), with the version and Update in its foot as the shared updater's words expect. On app
screens the leading control is Back. Retiring the menu waits for stage 3, when every page is under the roof and
`menu.js` can change. George, Q8.

---

## 2. Architecture

### 2.1 Who answers what at inflite.ai (stage 1)

| Request | Roof on, hub ready | Roof on, hub not ready | `ROOF_OFF=1` |
|---|---|---|---|
| `/`, `/index.html` (document) | assets: Today's page = the framework | same, degraded | same (Today on the framework; Weather links go to the hub page) |
| `/weather/`, `/weather/index.html` (document, any query) | Worker: framework page (`roofPage`) | framework page → client replaces to `weather.inflite.ai/<same>` on an explicit "no" (D23) | hub: Weather's milestone-1 page |
| `/weather` | 301 → `/weather/` + search | same | hub as now |
| `/weather/sw.js` | Worker: retiring worker (`RETIRE_SW`) | retiring worker | hub: Weather's `sw.js` |
| `/weather/roof/*` | hub forward (no cookie) | 503 (as now) | **404** |
| `/weather/<anything else>` (Weather's files, `version`, vendor) | hub forward (no cookie) | 503 (as now) | hub forward |
| `/api/weather/*`, `/api/pigeon|fitness|markets/*` | hub API (cookie) | 503 | hub API |
| `/chats/*`, `/fitness/*`, `/markets/*` | hub pages (unchanged) | 503 | unchanged |
| `/mail/*` | `mailhost.js` (unchanged) | unchanged | unchanged |
| `/api/hub` | `{ ready: true, roof: true }` | `{ ready: false, roof: true }` | `{ ready, roof: false }` |
| `/roof/*` | assets (framework files, `Cache-Control: no-cache` from `_headers`) | same | same |

`wrangler.toml` needs no change (`run_worker_first` already lists `/weather` and `/weather/*`). `index.js` needs no
change (`isHubPath` covers `/weather/*`).

### 2.2 The layers in files

```
IFL today/public/
  index.html, app.js, app.css         Today's host page: session, sign-in, push, day refresh, Today/Apps/You screens (TD)
  day.js, day.css                     Today's day, unchanged
  cards.js                            one change: the weather card's warning chip opens Warnings (TD)
  apps.js, you.js                     Apps (live minis) and You (Connected Apps, Weather Notifications) (TD)
  roof/                               the framework (FW; router.js and the token block by B0)
    frame.js router.js header.js tabs.js sheet.js toast.js ui.js
    search.js send.js modules.js connectors.js roof.css
  sw.js, _headers                     root worker, page headers (SV)
IFL today/src/hub.js, roof.js         /weather/ document rule, retiring worker, roof-off 404, /api/hub roof (SV)
MAIN weather/roof/                    Weather's module (WX core, WV views, WS settings)
  weather.js connector.js core.js sync.js places.js radarview.js       (WX)
  now.js days.js warnings.js wxui.js                                   (WV)
  wxsettings.js                                                        (WS)
  weather.css (WV) wxcore.css radar.css (WX) wxsettings.css (WS)
MAIN weather/radar.js mapgl.js mapleaf.js   small backward-compatible options (WX)
MAIN .github/workflows/roof.yml, .github/hub/hub.sh   the off switch (SV)
MAIN .tools/tests/roofhooks.mjs       the selectors tests may rely on (B0, frozen)
```

### 2.3 A Weather open, step by step (hub ready, roof on, signed in)

1. Today is showing. You tap the weather card's head (`<a href="/weather/?lat=…&name=…">`, from cards.js).
2. `frame.js`'s document click listener (bubble phase, after the shared block's crumb listener) sees a same-origin
   link that `router.owns()`; `preventDefault()`; `F.nav.go(href, { zoomFrom: a.closest(".tcard") })` [UI5].
3. The router parses `{ kind:"app", app:"weather", section:"now", key:"now", arg:null, query:"?lat=…" }`. Inside the
   View Transition's update callback, **synchronously** [UI5]: the frame `pushState`s, shows the Weather screen with a
   skeleton whose hero slot holds an inert, `aria-hidden` clone of the tapped card (same sky, temperature, place: the zoom
   target exists at once), sets the header (crumb Weather, title from `wx:places[wx:cur]` or the card's place, switcher
   from the registry), sets `html[data-app=weather]`, tabs current = Apps. The callback never awaits the module.
4. `modules.js` (re-asking `/api/hub` first, D14) imports the module (first time) with a 12 s deadline, checks
   `CONTRACT === 1`, awaits its CSS, `mount(root, fw)`, then `show(route, { sky, temp, place })` (the hint read from the
   card). `core.js` handles the query (a place in `wx:places` or in the account's places → switch; else "Add “X”?"
   sheet), draws Now from the kept forecast at once (its hero uses the hint's sky until its own forecast arrives
   [RI20]), refreshes in the background. When the module's hero is in, it calls `fw.zoomTarget(heroEl)`; the frame
   removes the clone in the same frame (no second transition).
5. After `show` settles the frame replaces the URL with `/weather/` (D6).
6. Back (header, edge swipe in standalone, browser back): sheets closed (D22) → `instance.back()` → false →
   `history.back()` → Today, scroll restored.

---

## 3. The framework (IFL `today/public/roof/`)

### 3.1 Files and what each exports (names frozen by B0)

| File | Exports | Loaded |
|---|---|---|
| `frame.js` | `CONTRACT` (=1), `createFrame(opts) → F` | static, from app.js |
| `router.js` | `REGISTRY`, `TABS`, `parse(href, { roof }) → Route\|null`, `format(route) → path`, `owns(path, { roof }) → bool`, `ownPath(p) → bool` | static |
| `header.js` | `createHeader(host, F) → Header` | static |
| `tabs.js` | `createTabs(nav, F) → Tabs` | static |
| `sheet.js` | `createSheets(F) → Sheets` | static |
| `toast.js` | `toast(text, { action, app }) → void` | static |
| `ui.js` | `el, esc, icon, card, list, row, label, chip, stats, btn, iconBtn, seg, sw, field, tile, mini, avatar, badge, empty, error, skeleton` | static |
| `search.js` | `createSearch(F) → Search` | **static** [UI10] |
| `send.js` | `createSend(F) → Send` | static (tiny) |
| `modules.js` | `loadModule(app, F) → Promise<{ m, instance }>`, `loadConnector(app) → Promise<Connector>`, `preload(app)`, `watchVersion(app, build, F)`, `keepOffline(app, build, files)` | lazy (first app open, or idle preload) |
| `connectors.js` | `STATIC` (chats, fitness, markets, mail descriptors), `connectorOf(app) → Promise<Connector>`, `miniOf(app, answer) → Promise<Mini\|null>`, `openConnector(F, app)`, `placesProvider(F) → off` | lazy (Apps/You/search) |
| `roof.css` | tokens added to `:root` (accent sets, `--bar`, radii, durations, `--hd-h`, `--tabs-h`) + every component's CSS | `<link>` in index.html |

Today's files are not minified (IFL has no min step). Budget for `roof/*.js` together: **≤ 20 KB gzip measured with
comments stripped** (`roofui.test` strips `//` line and `/* */` block comments, then gzips) [RI18]. No inline styles
anywhere: dynamic values through `el.style.setProperty("--x", v)` or `data-*` + CSS; `roofui.test` scans `roof/*.js` for
inline styles and handlers [RB5a].

### 3.2 `createFrame(opts)` and `F`

`opts` (from app.js): `{ root: #in, header: #hd, views: #views, tabs: #tabs, session: () => ({ view, hub, roof, links }),
lost: signedOutNow, checkSession: () => Promise<bool signedIn>, save: () => ({ y, … }), onMe: (button) => openMenu,
me: () => Node (your photo), today: { screen spec }, apps: {…}, you: {…} }`.

```
F.screen(id, spec)            // built-in screens "today" | "apps" | "you": spec { el, title(), crumb(), line(), acts[], onShow(route), onHide() }
F.nav.go(path, { replace, zoomFrom, from })   // in-page if router.owns(path) (and not F.stale into an app, D21), else IFL.hub.go(path) (writes the crumb) + location.assign
F.nav.back()                  // the Back rule, §3.4
F.nav.section(app, id, { arg })   // replaceState; header switcher and URL follow
F.route                       // the current Route
F.header, F.tabs, F.sheet, F.toast, F.search, F.send, F.ui
F.session                     // { view, hub, roof, links, lost() → Promise<bool> }
F.setRoof(bool)               // D14: from app.js when /api/hub answers differently
F.restamp()                   // re-writes a missing history.state.ifl (after app.js's own hash handling, RI1)
F.stale                       // D21
F.fill(on)                    // D20
F.on(evt, fn) → off           // "route", "visible", "hidden", "theme", "signedout"
F.busy() → bool               // a sheet open, or the shown module's busy()
F.forModule(app) → fw         // §5.2
F.destroy()                   // sign-out: unmount modules, close sheets, hide the frame
```

Installed by `createFrame`:
- `history.scrollRestoration = "manual"`;
- the link interceptor (document `click`, bubble phase; ignores modified clicks, `target=_blank`, `download`,
  non-owned paths);
- `popstate` → close sheets (D22) → re-stamp a missing `ifl` state → render from `location`;
- the root worker's `{ifl:"route", url}` listener: if `ownPath(url)`, reply `{ifl:"routed"}` on the port, then
  `F.nav.go(url, { from: "notification" })` (a non-owned path goes through `IFL.hub.go` + `location.assign`);
- edge-swipe Back (standalone only, D19);
- `visibilitychange` → `visible`/`hidden` events; `pagehide` → `ifl-roof-y` (D20).

(The unregister of Weather's old worker is app.js's, in `start()`, D10.)

### 3.3 The router (`router.js`, pure; written in full by B0)

```
Route = { kind: "tab", tab: "today"|"apps"|"you", arg: string|null }
      | { kind: "app", app: "weather", section: "now"|"days"|"radar"|"warnings", key: string, arg: string|null, query: string }
REGISTRY = { weather: { app: "weather", name: "Weather", path: "/weather/",
  entry: "/weather/roof/weather.js", connector: "/weather/roof/connector.js",
  css: ["/weather/roof/weather.css", "/weather/roof/wxcore.css", "/weather/roof/wxsettings.css", "/weather/roof/radar.css"],
  sections: [["now","Now"],["days","16 Days"],["radar","Radar"],["warnings","Warnings"]],
  aliases: { day: "days", settings: "now" } } }
TABS = { today: ["Today", "/", "sun"], chats: ["Chats", "/chats/", "bubble"], apps: ["Apps", "/#apps", "grid"], you: ["You", "/#you", "person"] }
```
- `parse(href, { roof })`: same origin only; `/` or `/index.html` → tab from hash (`#apps`, `#you`, `#you=<arg>`,
  anything else → today; app.js keeps handling `#morning`, `#notify`, `#signin=`, `#go=`); a registry path (`/weather/`,
  `/weather/index.html`) when `roof` → app route: hash `#<key>` or `#<key>=<arg>`; key mapped through `aliases`, then
  must be a section id, else `now`; `arg` only `[\w-]{1,40}`; `query` = `location.search` raw (≤ 400 chars, else "").
  Anything else → `null` (not ours).
- `format(route)`: tab → `/`, `/#apps`, `/#you`, `/#you=<arg>`; app → `/weather/` for now with no key,
  `/weather/#<section>`, or `/weather/#<key>=<arg>`; never a query.
- `owns(path, { roof })` = `parse(...) !== null`. Callers always pass `roof: session.hub && session.roof`. `ownPath` = the
  shared block's rule (starts `/`, not `//`, no `\` or control characters, ≤ 200).
- History state written by the frame: `{ ifl: { d: depth, k: key } }` only. The frame also keeps, in memory, the route
  of each depth it pushed (for the Apps rule, §3.6, and Back labels).

### 3.4 Screens, stack, Back, scroll

- Screens live in `#views`: `main#today`, `main#apps`, `main#you` (existing) and, created on first open,
  `main#m-weather.view.ifl-screen[data-app=weather]` holding `div.m-weather` (the module root).
- Showing a screen: others `hidden` + `inert`; `html[data-app]` = the screen's app (`inflite` for tabs);
  `html[data-route]` = `format(route)`; header `set()`; tabs `set(current)` (`apps` while in an app). Focus: §3.15.
- **Back rule** (header Back, edge swipe, `fw.nav.back()`): a framework sheet open → close it; else the shown
  module's `back()` → true stops; else depth > 0 → `history.back()`; else (a cold deep link) →
  `F.nav.go("/#apps", { replace: true })`. Depth is `history.state.ifl.d`, or the frame's in-memory depth when the state
  has been wiped by code outside the frame (the shared block's `wantsAllow()` does `replaceState(null, …)`); the frame
  re-stamps it on `popstate` and when app.js calls `F.restamp()` after its hash handlers [RI1]. The header shows Back
  only on app screens.
- Scroll: `Map(k → y)` and, in an app, `Map(k+section → y)` in memory; saved on leaving an entry or a section,
  restored after the screen or section shows; a new push starts at 0; `ifl-roof-y` across a round trip (D20).

### 3.5 Header (`header.js`), one persistent element in `#hd`

- **Built once from the shared block's own structure** [RI16]: row 1 is `IFL.header({...})` (the `header.ifh` with
  `.ifh-me`, `.ifh-t > h1.ifh-name + .ifh-line`, `.ifh-acts`), so the copied menu.css styles it and a `menu.js` change
  reaches it; the framework adds `.ifh-crumb` (above the title), the Back button and row 2 (the switcher). `set(spec)`
  patches it (never re-rendered per tap). `roofui.test` pins the shared skeleton against `IFL.headerHtml()`'s output.
- Row 1: leading = your photo (`.ifh-me`, opens InFlite's menu, D24) on tab screens, or **Back on app screens: icon-only,
  44 px round, `aria-label` naming where it goes ("Back to Today", "Back to Apps"…) from the previous route** [UI3];
  title block (`.ifh-crumb`: on Today the date "Tuesday 3 November", on an app the 16 px app icon + name in
  `--acc-ink`; `h1.ifh-name` with optional `.ifh-pick` ▾ button; `.ifh-line` under it); trailing capsule (`.ifh-acts`:
  Search always first, then up to two `acts`). The title block keeps at least 112 px; below that the crumb hides before
  the title shrinks; long titles ellipsis on one line with the full text in `aria-label`.
- Row 2: the section switcher (app screens only): `role="tablist"`, buttons `role="tab"` + `aria-selected` +
  `data-sec`, the screen body `role="tabpanel"`; **manual activation** (arrows move focus, Enter/Space selects)
  [UI12]; a sliding lens (`aria-hidden`; transform from `offsetLeft/Width`, recomputed on every `show`, on resize and on
  `document.fonts.ready` [RI19]); a **badge per section** (`badges: { warnings: 2 }` → a `--danger` count, the tab's
  accessible name "Warnings, 2 in force") [UB2]; scrolls horizontally with an edge fade when it doesn't fit (never
  squeezes labels).
- `spec = { back: { label } | null, crumb: { text, app? }, title, compactTitle?, pick: { label, run } | null, line, acts:
  [{ icon, label, run }], sections: [[id,label]] | null, section, badges? }`.
- Compaction: large → compact over the first 64 px of window scroll as `--p` (0..1) (`IFL.watch/settle`), the crumb and
  line fading to 0 height, the title 32 → 20 px, band glass in. **Compact, the title shows `compactTitle` when given**
  (Weather: "London · 14°") [UI4]. The header keeps its height while compacting; `--hd-h` published from a
  ResizeObserver for screens' top padding. `html.ifl-fill` holds it compact (D20).
- One `h1` per screen; ≥ 44 px targets.

### 3.6 Tab bar (`tabs.js`), one persistent `nav#tabs.ifl-tabs`

- Same markup as `IFL.hub.tabs` (`a.ifl-tab[data-tab]` with the shared glyphs) so menu.css styles it and hub pages look
  the same; plus a sliding pill (`.ifl-tab-pill`, `aria-hidden`) in menu.css's tab colour (D18); the bar has class
  `has-pill`, and roof.css turns off menu.css's static pill under it
  (`.ifl-tabs.has-pill .ifl-tab[aria-current] { background: none }`).
- Hrefs: `/`, `/chats/`, `/#apps`, `/#you`; degraded: Chats → Chat's own address (as `IFL.hub.tabs` does). Today, Apps,
  You clicks route in-page (the link interceptor); Chats navigates.
- `set(current)`: on a tab screen the current tab has `aria-current="page"`; in an app, Apps is current with
  `aria-current="true"` (the page is Weather) [UI12].
- **Taps [UB4]:** on a tab screen, tapping its own tab scrolls to top (as now). **In an app, tapping Apps goes to Apps**:
  if the entry before is Apps (depth > 0 and the remembered route at depth−1 is `apps`), `history.back()` with a `pop`
  transition; otherwise push `/#apps` with a `pop`-style transition. Any other tab pushes (Today's current behaviour,
  kept for `todayshell`).
- `view-transition-name: ifl-tabs` kept (the cross-page fades to hub pages still use it). Hidden state `.away` exists
  (stage 3 composer), unused now.

### 3.7 Transitions

- Same-document `document.startViewTransition` when available and motion isn't reduced; type on `html[data-vt]`:
  `push` (new screen from 28 px right + fade, .38 s `--ease-glide`), `pop` (mirror), `tab` (cross-fade .2 s), `zoom`
  (§2.3 step 3: the update callback is synchronous and only shows the skeleton with the card clone), `section` (16 px
  slide by direction + fade, .25 s, the lens moving with it) [UI6a]. Header and tab bar have their own
  `view-transition-name`s so they don't slide.
- Which: Apps tile → Weather `push`; Today card → Weather `zoom` (source `a.closest(".tcard")`), else `push`; search
  result and notification tap → `push` [UI6c]; Back and browser back `pop`, **skipped entirely when the
  `PopStateEvent.hasUAVisualTransition` is true** (Safari's and Chrome's own swipe already animated) [RI2, UI6b].
- Accent change: the wash layer cross-fades by opacity (never an animated gradient, `map-design` §4.1); crumb, switcher
  and pill colours change inside the transition, not before it [UI6d].
- Fallback (no VT): the entering screen gets `.ifl-enter-push|pop|tab|section` CSS animations.
- Reduced motion: 150 ms cross-fade for every kind; indicators jump; no zoom.
- Cross-document fades to and from hub pages stay as they are (`@view-transition` in menu.css, `fade.js`, `FADES`).

### 3.8 Sheets (`sheet.js`)

- One component on `<dialog>.showModal()` (focus trap, Escape, inert page, top layer over the tab bar): grab bar, head
  (`h2` + `.ifs-btn` close ✕, back ‹ on a pushed page), optional hero (`.ifs-hero`: 64 px app icon, name, line),
  body, optional sticky action row. Drag down to dismiss; Weather's open/close keyframes (`--dur-sheet-in/out`,
  `--ease-glide`); centred max 560 px at ≥ 700 px wide; max-height follows `visualViewport`.
- `open({ label, title, hero, body: Node | (el) => void, acts, onClose, app })` → `{ el, close(), push(page),
  pop(), setBusy(bool) }`; `openEl(dialog, { onClose })` for the dialogs already in index.html (Morning, Every App's,
  Edit Today). `app` scopes the accent to the sheet (never left on the page). Sheets push no history (D22).
- **Static dialog markup (frozen by B0, written by TD in index.html, styled by FW)** [RB5]:
  `<dialog class="ifl-sheet" id="…" aria-labelledby="…-t"><div class="ifs-grab" aria-hidden="true"></div><header
  class="ifs-head"><h2 id="…-t" tabindex="-1">…</h2><button class="ifs-btn" type="button" data-close
  aria-label="Close">✕</button></header><div class="ifs-body">…</div><footer class="ifs-acts">…</footer></dialog>`
  (footer optional). `open()` builds the same structure.
- While any sheet is open, `body.sheet-up` is set (Weather's `charts.js` holds back on it).
- Chat's engine dialog still opens above everything (its own later `showModal`).

### 3.9 Toast (`toast.js`)

The shared block's look (`.ifm-note.ifl-toast`, above the tab bar, wraps, announced through one `aria-live` region),
one at a time, 3.6 s; with `action: { label, run }` it stays 6 s or until tapped; the timer pauses while hovered or
focused, and every action offered in a toast is also reachable elsewhere on the screen (WCAG 2.2.1) [UI12]. Replaces
Today's `toast()`; IFL's own `toast` (used by `IFL.hub.sent`) keeps working and looks the same.

### 3.10 Search (`search.js`)

- Header Search on every framework screen → a sheet "Search everything": `input type=search` (16 px, clear button,
  `role="combobox"` + listbox, Enter opens the first result), results grouped (label + rows with app icon or avatar,
  title, sub, chevron), "Nothing for “…”" via `textContent`. **The sheet and its input are created and focused
  synchronously inside the tap's own handler** (iOS raises the keyboard only then) [UI10].
- `provide({ id, group, order, search(q) → Entry[] | Promise<Entry[]> }) → off`; `Entry = { title, sub, icon?: app,
  avatar?: name, href?: path, run?: fn, label? }`. Providers are called on every input (debounced 80 ms); a provider
  that takes longer than 300 ms is shown when it arrives; one that throws is left out silently.
- Empty field: the Apps provider's entries (each app and its sections). Nothing remembered past the sheet.
- Providers in stage 1: **Apps** (FW: every app + sections from REGISTRY and STATIC: "Weather · Radar" → `/weather/#radar`,
  "Fitness · Activities" → `/fitness/#activities`, …); **Places** (FW's `connectors.js placesProvider(F)`, registered by
  the frame when hub && roof, from Weather's `connector.search` over `wx:places`, on device, plus "Weather Settings" →
  `/weather/#settings`; replaced by the module's own provider while it is mounted [RB5]); **Today** (TD: the day's tops,
  Coming Up rows and cards by their titles; People waiting by name → `/chats/#open=<id>`); **Settings** (TD: You's rows:
  Notifications, Weather Notifications, Quiet Hours, Rules, This Phone, Connected Apps, Account, Sign Out →
  `/#you=<id>`).
- Rule 6 as D16. A unit test drives `search.js` with a fake `fetch` that fails the test if called.

### 3.11 Send (`send.js`)

`send({ words, packed, what, to })` → `IFL.hub.send(words, packed, { to })` (engine sheet; degraded → Chat's own
address; the "Sent to Pat. You're still here" toast stays `IFL.hub.sent`'s). `button({ words, packed, what })` → a
`.ifl-btn` "Send" with the send glyph that calls it, `aria-label="Send <what> to a friend"`.

### 3.12 Modules and connectors (`modules.js`, `connectors.js`)

- `loadModule(app, F)`: re-asks `/api/hub` through app.js (D14; at most every 5 minutes) and refuses unless
  `F.session.hub && F.session.roof`; `import(REGISTRY[app].entry)` with a 12 s deadline; `m.CONTRACT === 1`; `<link>`
  each CSS and await load (5 s cap); `IFL.built(app, m.BUILD, m.NEWS)` once; `mount(root, F.forModule(app))`;
  `watchVersion`; `keepOffline(app, m.BUILD, connector.files)`.
- Failure (import error, timeout, contract mismatch, mount throws, a 404 from roof off): the screen shows `ui.error({
  title: "Weather didn’t open", body: "Try again, or open Weather on its own.", acts: [Try Again (`data-act="retry"`),
  Open Weather on Its Own (`data-act="own"`) → links.weather + same path/query/hash] })`. Try Again calls `import()`
  again (entry with `?retry=<n>`). **This recovers only a failed entry file**: a failed dependency stays failed in the
  document's module map, and a URL with a query isn't served by the root worker [RI13]; so a second failure offers
  "Reload" (`data-act="reload"`, `location.reload()`; the URL keeps the route), which is the real recovery.
- `keepOffline`: `navigator.serviceWorker.controller?.postMessage({ ifl: "keep", app, build, files })` with absolute
  same-origin paths, once per build per page.
- `preload(app)` (D2): `loadConnector(app)` then a `<link rel=modulepreload>` per `files` entry ending `.js`.
- `connectorOf(app)`: Weather → `import(REGISTRY.weather.connector)` (only when hub && roof; else a static fallback
  without `search`/`mini`); others → `STATIC[app]`.
- `miniOf(app, answer)`: the connector's `mini(answer)` (§6.1).
- `openConnector(F, app)`: the connector sheet (hero with app icon "<App>'s connector", one line "<App> keeps its own
  server and data. This is all it shares with InFlite:", one row per contract word the app's descriptor really fills,
  then "Open <App>" primary, and for Weather "Weather Settings" and "Weather Notifications" → `/#you=notify-weather`). At
  320 px the label column stacks.

### 3.13 Tokens and components (`roof.css`, `ui.js`)

- Tokens: keep app.css's (`--text*`, `--glass*`, `--solid`, `--line`, `--press`, `--edge`, `--lift`, `--sheen`,
  `--blur`, `--r-card` 30, `--r-group` 26, `--r-hero` 34, `--danger`, `--good`, `--good-text`, `--warn`,
  `--ease-*`, `--c-<app>`); add in roof.css: `--bar`, `--r-sheet` 38, `--r-well` 16, `--r-pill` 999px, `--ease-in`,
  `--dur-press` .1s, `--dur-fast` .2s, `--dur-base` .35s, `--dur-sheet-in` .5s, `--dur-sheet-out` .34s,
  `--tabs-h` 64px, `--gutter` 16px, `--hd-h` (set by JS), `--pos`/`--neg`, chart primitives (`--chart-grid`,
  `--chart-axis`, `--chart-now`), and the accent sets per `html[data-app]` / `[data-app]` (values exactly
  `map-design` §3.2; light under `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) }` and
  `:root[data-theme="light"]`, as app.css does). `--acc-wash` 13 % light / 16 % dark.
- Components (class prefix `ifl-`, CSS in roof.css, builders in ui.js returning elements, never HTML strings with
  data): `ifl-card` (+ `hero`, `list`, `tappable`; tinted glass with **no per-card backdrop blur**), `ifl-label`,
  `ifl-list`/`ifl-row` (leading icon/app icon/avatar/time column; text wraps; trailing value/stacked/chevron/switch/
  badge/round action), `ifl-chip` (tag, action ≥ 44 px hit, ≥ 12 px text), `ifl-stats` (`<dl>`, `auto-fit
  minmax(84px,1fr)`), `ifl-btn` (+ `primary` = `--acc-fill`/`--on-acc`, `small`, `destructive`), `ifl-icon-btn`,
  `ifl-seg-sm` (small segmented control, selected = `--acc-fill`), `ifl-switch` (Today's native checkbox switch),
  `ifl-field`, `ifl-tile` + `mini` (num, bars via `--h`, ring, spark, count), `ifl-avatar` (`.av-c1…8` hashed, photo
  over initial), `ifl-badge`, `ifl-empty`, `ifl-error`, `ifl-skeleton` (opacity pulse; static under reduced motion).
- Reduced transparency → `--solid`, no backdrop-filter, on cards, sheets, tab bar, header band, toast. `prefers-contrast:
  more` → `--text-2/3` α .9/.8, `--line` α .3, solid 1 px edges. `forced-colors: active` → outlines on the selected tab
  and segment.
- Safe areas: header top `env(safe-area-inset-top) + 10px`, sides `max(16px, inset)`; tab bar bottom `10px + inset`;
  screens' bottom padding `--tabs-h + 40px + inset`; sheets bottom `28px + inset`. `body` is never padded by insets.
  Landscape at height ≤ 500 px: tab bar 48 px (menu.css's), header compact, switcher still shown.

### 3.14 Test hooks (frozen by B0 in MAIN `.tools/tests/roofhooks.mjs`) [RB5e]

End-to-end tests (Q's, TD's, WX's, FW's) select only through these; anything else needs the owner's sign-off. Owners
must keep them.

| Hook | Owner |
|---|---|
| `html[data-app]`, `html[data-route]` (= `format(F.route)`), `html.ifl-fill` | FW |
| `#hd h1.ifh-name`, `#hd .ifh-pick`, `#hd .ifh-crumb`, `#hd .ifh-line`, `#hd .ifl-back`, `#hd .ifh-me`, `#hd [data-act=search]` | FW |
| `#hd [role=tablist] [role=tab][data-sec]` (+ `aria-selected`), `.ifl-sec-badge` | FW |
| `nav#tabs .ifl-tab[data-tab]` (+ `aria-current`) | FW |
| `dialog.ifl-sheet[open]`, its `h2`, `[data-close]`; search sheet `dialog.ifl-sheet[data-sheet=search] input[type=search]`, result rows `[role=option]` | FW |
| `.ifl-toast` | FW |
| error state `.ifl-error [data-act=retry|own|reload]` | FW |
| `main#today`, `main#apps`, `main#you`, `#youApps`, `#youNotify`, `dialog#sh-wxnotify`, Apps tiles `.ifl-tile[data-app]` | TD |
| `main#m-weather`, `section.wx-sec[data-sec=now|days|radar|warnings]`, `.wx-hero`, `.wx-alerts`, `.wx-credits`, `.radar-map` | WX (frame) / WV (contents) |
| Places sheet `dialog.ifl-sheet[data-sheet=places]`, rows `[data-place]`, confirm sheet `[data-sheet=confirm-place]` | WX |
| Weather Settings `dialog.ifl-sheet[data-sheet=wxsettings]`, pages `[data-page=units|arrange|best|commute|solar|forecast]` | WS |

### 3.15 Accessibility rules [UI12]

- Focus moves to the header `h1` (`tabindex=-1`) only when the screen changes, never on a section switch (focus stays
  on the tab) and never on first load. On a pop, focus returns to the element that opened the screen (kept per history
  key), falling back to the `h1`.
- Switcher: manual activation (§3.5). Tab bar: `aria-current` as §3.6. Pills, lens: `aria-hidden`. Back:
  `aria-label` naming its destination.
- Toast: one `aria-live` region; pause on hover/focus; actions reachable elsewhere.
- Reorder buttons (Places Edit, Arrange Now) announce the new position through an `aria-live` line, as Today's Edit
  sheet does (`#edSay`) [RI19].

---

## 4. Today, Apps and You on the framework (TD)

### 4.1 `app.js` (host page)

Kept as is: session/sign-in/handback/sign-out, push and devices, kept copies and their rule-6 filtering, the day
(`drawCards`, `dayCtx`, `refresh`, `nextMinute`), Edit Today's logic, morning sheet logic, engine idle-create, root
worker messages, `goFromHash`, `load`, `openMenu` (D24), `hubSays`.

Replaced or changed:
- `VIEWS`/`route()`/`onTab()`/`drawAppsNow`/`drawYouNow` → `F = createFrame(...)` in `signedIn()` (once per page) with
  `F.screen("today"|"apps"|"you", …)`; Apps and You still lazy-import `apps.js`/`you.js` on first show.
- `drawHeader()` → header specs: Today `{ crumb: date line, title: "Today", line: S.dayLine, acts: [Edit] }`; Apps
  `{ title: "Apps" }`; You `{ title: "You" }`. The photo opens `openMenu` (D24), whose rows gain "Connected Apps".
- `openSheet/closeSheet/toast` → `F.sheet.openEl` / `F.toast`; `#morning`, `#sh-every`, `#sh-edit` become
  `<dialog class="ifl-sheet">` in index.html with the frozen markup (§3.8); `youCtx.openSheet/closeSheet` map to
  `F.sheet`.
- **`hubReady()` becomes three-way** (D23): `"yes" | "no" | "unknown"`; only yes/no kept (`ifl-hub-ready`); it also reads
  `roof = j.roof === true` into `sessionStorage["ifl-roof"]` (D14); `S.roof`; `F.session` exposes `{ view, hub, roof,
  links }`. A re-ask helper (`hubAgain()`, at most every 5 minutes) runs on `visible` and before `loadModule`, and
  calls `F.setRoof` on a change.
- **`start()`**: as soon as `/api/hub` says roof is on (signed in or not, before sign-in decides), unregister any service
  worker registration whose scope pathname is `/weather/` [RI10].
- At boot on `/weather/…`: an explicit `"no"` → `location.replace(IFL.hub.go(path+search+hash))`; `"yes"` with
  `roof:false` → D14 bounce; `"yes"`+roof or `"unknown"` → the frame renders the route (sign-in first if needed), and
  `modules.preload("weather")` starts at once in parallel with `/api/session` when `ifl-hub-ready="1"` is kept.
- Signed out at any route: `#out` with `#signin` href `/chats/#signin-start&then=<encodeURIComponent(path+hash)>` (hub),
  in `hubSays` **and** the `#signin` click handler [RI15]; degraded keeps `goToAccount()` as now.
- The three `history.replaceState(null, …)` calls in TD's own code (`fromHash` for `#morning`, the worker `open` path,
  `goFromHash`) keep `history.state` instead, and `F.restamp()` is called after them (the shared block's `wantsAllow()`
  can't change: the frame re-stamps after it) [RI1].
- `IFL.updates({ busy: () => F?.busy() || !!sheetOpen, save, files: [...today files, ...roof files] })`; `save()`
  returns `{ y: scrollY }` and the boot restores it from `IFL.here("today")` (used by D21 too).
- `pagehide`/`pageshow` (D20) for `ifl-roof-y` and bfcache refresh.
- Search providers Today and Settings (§3.10) registered after the frame is made.
- `signOut()` and `signedOutNow()` call `F.destroy()`; `checkSession` for `fw.session.lost()` (D3) is a debounced
  `/api/session` read.

### 4.2 `apps.js`

Tiles keep their hrefs (`/weather/`, chips `/weather/#radar`, `/weather/#warnings`; Fitness, Markets, Mail as now) and
gain the live mini (`ifl-tile` + `mini`) from `connectors.miniOf(app, S.answer)`; a tile without a mini looks as
now. Grid `repeat(auto-fill, minmax(160px, 1fr))`, one column at 320. Note under them unchanged.

### 4.3 `you.js`

- New section **Connected Apps** (`id="youApps"`, after Notifications by App): a row per app (Weather, Chats, Fitness,
  Markets, and Mail for the admin), 44 px, with its icon, name and one line naming only the contract words its
  descriptor really fills ("Cards · Search · Notifications · Actions · Screens" for Weather; fewer for the others)
  [UI11]; tap → `openConnector(F, app)`.
- **Weather Notifications sheet** (`dialog#sh-wxnotify`, opened from You's Weather row, from `/#you=notify-weather`, from
  the connector sheet and from Weather Settings) [UB3]. From `GET /api/notify` (`weather: { places, brief, briefAt,
  email, solar }`, `emailOk`): a row per place with Rain and Warnings chips (`PATCH /api/notify { weather: { place: {
  lat, lon, name, rain, warn } } }`); Morning Briefing (Off or one of the places, and a time: `{ weather: { brief,
  briefAt } }`); Email for Warnings and the Briefing when `emailOk` (`{ weather: { email: { warn, brief } } }`); a
  line for the solar alert when `solar` ("Sunshine for your panels: in Weather Settings, Solar"). No new endpoint: the
  same route and body shapes `setNotify` already takes. With no places: "Add a place in Weather to choose its rain
  alerts. Warnings come for every place you add." and a button "Open Weather" (→ `/weather/`).
- You's Weather row says "Rain and warnings for the places you choose" and opens that sheet (the "in Weather" wording
  goes).
- `/#you=<id>` scrolls to the section (`notify` → `#youNotify`, `apps` → `#youApps`, …) or opens the sheet
  (`notify-weather`).
- Versions section shows Weather's from `ifl-build:weather` as now. Everything else unchanged.

### 4.4 `cards.js`, one change; the rest untouched

The weather card's warning chip links `c.href + "#warnings"` (that place, the Warnings section) [UB2, UI14]; the head
and the hours strip keep `c.href` (Now). `todaydaypage` covers it. `day.js`, `day.css`, `wxicons.js`, `mailhost.js`,
`fade.js`, `theme.js` are untouched. Their links are `<a href>` (intercepted); Send is `cards.js`'s `wireSend` →
`IFL.hub.send` (unchanged).

---

## 5. The module contract (v1)

### 5.1 What a module exports (`weather/roof/weather.js`)

```js
export const CONTRACT = 1;
export const BUILD = "1.65";          // = weather/app.js BUILD (roofcontract.test)
export const NEWS = "…";              // = weather/app.js NEWS
export const SECTIONS = [["now","Now"],["days","16 Days"],["radar","Radar"],["warnings","Warnings"]];   // = REGISTRY = connector
export async function mount(root, fw) → instance
instance = {
  show(route, hint) → void | Promise,   // route: the router's app Route; hint: { sky, temp, place } from a zoom, or null; resolves on first paint of that section
  hide(),                         // its screen left: pause timers, radar playback, observers
  back() → boolean,               // an inner step handled (e.g. a module-owned overlay); stage 1 Weather: false
  busy() → boolean,               // the updater must wait (e.g. a place being added, settings saving)
  sendable() → { words, packed, what } | null,
  unmount(),                      // sign-out or roof off: stop everything, release radar (destroy), remove listeners
}
```
Rules (checked by `roofcontract` where a grep can): a module defines nothing on `:root`, `html` or `body` (its CSS is
scoped under `.m-<app>`); registers no service worker; calls no `history.*`, `location.*` (except reading),
`confirm()`/`alert()`; adds no document/window listeners it doesn't remove in `unmount()`; never touches the header, tab
bar or another screen's DOM; writes no `today:*` key; every dynamic `import(` is inside `fw.lazy(`; and [RI17] no
`window.IFL`/`IFL.` use, no `document.getElementById(`/`document.querySelector(` (only `root`/`fw.screenEl` and
elements it made), no `localStorage.getItem("today:`, no `indexedDB`, no `parent.`.

### 5.2 What a module gets (`fw = F.forModule(app)`)

```
fw.contract = 1; fw.app = "weather"; fw.screenEl (main#m-weather)
fw.ui                                   // §3.13 builders
fw.header.set({ title, compactTitle, pick, line, acts, badges })   // only while its screen shows; sections and crumb are the framework's
fw.nav.go(path) / fw.nav.back() / fw.nav.section(id, { arg }) / fw.nav.href(section, arg)
fw.sheet.open(spec)                     // §3.8, accent = the app
fw.toast(text, opts)
fw.send({ words, packed, what }) / fw.sendButton({ words, packed, what })
fw.search.provide(provider)             // replaces placesProvider while mounted
fw.session = { user: { id, name }, lost() → Promise<boolean> }   // D3
fw.visible() → bool; fw.on("visible"|"hidden"|"theme", fn) → off
fw.theme() → "light"|"dark" (html[data-theme] first, else the media query); fw.motion() → "full"|"reduced"
fw.zoomTarget(el)                       // the module's hero is in: the frame drops the card clone
fw.fill(on)                             // D20
fw.lazy(() => import(…)) → Promise; fw.stale() → bool   // D21
```

---

## 6. The connector contract (v1)

### 6.1 Client part (`weather/roof/connector.js`, ≤ 4 KB, no imports)

```js
export const CONNECTOR = 1;
export const connector = {
  app: "weather", name: "Weather",
  shares: {
    cards: "Today’s weather card, rain on your ride, warnings",
    search: "Your saved places, on this phone",
    notifications: "Rain alerts, warnings, the morning briefing and sunshine for your panels, through InFlite",   // [UI11]
    actions: "Open Now, 16 Days, Radar or Warnings; send the forecast",
    screens: "Now · 16 Days · Radar · Warnings",
  },
  sections: SECTIONS-equal, aliases: { day: "days", settings: "now" },
  files: [ every file in the module's static import graph (its own and the 14 reused) + REGISTRY.weather.css; never vendor/, the radar stack, rainmap.js or radarrain.js ],
  mini(answer) → { kind: "num-bars", num: "14°", bars: [0..100 ×5], label: "Rain from 15:00" } | null,   // from answer.cards.weather (now.temp, list[].pop); null unless state "ok"
  search(q) → [{ title: name, sub: region, icon: "weather", href: "/weather/?lat=…&lon=…&name=…" }],  // wx:places, case-insensitive substring, ≤ 8; plus "Weather Settings"
};
```
Static descriptors in `roof/connectors.js` for the apps that are not modules yet: the `shares` keys each app really
fills, and only those (Chats: cards, notifications, screens; Fitness: cards, notifications, actions, screens; Markets:
cards, notifications, screens; Mail: notifications, screens), `sections`, hrefs to their hub pages, and `mini` where
Today's answer has the figure: Markets `{ kind: "pct-spark", pct }` from `answer.cards.markets.pct` (and a spark from
the card's intraday values where it carries them, drawn as a shape, never labelled with amounts), Fitness a number only
if `answer.cards.fitness` carries `ctl`, Chats and Mail none. Words must be true today; no promise of stage 2 features.

### 6.2 Server part, for Weather (all existing)

| Contract | Served by | Change in stage 1 |
|---|---|---|
| Cards | `GET /api/today?v=2` → account `today/cards` → `_todaywx.js weatherCard`, `_todayday.js` tops/upcoming/`apps.weather` | none |
| Search | none on a server (on-device) | none |
| Notifications | `_wxpush.js` (rain, warnings, briefing, solar) → `_notify.js`; one hub subscription fanned out (`_devices.js`, `via='hub'`); root `sw.js openAt` maps taps to `/weather/?lat=…`, `#warnings`; configured through `/api/notify` (`setNotify`'s `weather`) from You | root `sw.js` delivers taps in-page (`{ifl:"route"}`) |
| Actions | deep links (§1 D6); Send via `pigeon/cards.js` format (`weather/send.js weatherSendCard/packCard`) | none |
| Screens | `/weather/` + sections; module files through the hub | `/weather/` document = framework (D7) |
| Data the module reads | `/api/weather/where`, `warnings`, `obs`, `me` (GET/PUT), via the hub with the cookie; Open-Meteo, BigDataCloud, Nominatim, RainViewer, OpenFreeMap from the browser | page CSP allows them (§8.3) |

---

## 7. The Weather module (MAIN `weather/roof/`)

### 7.1 Files, owners, reuse

B0 freezes each file's exports. Sheets are opened through **exported openers in the file that owns their content**
[RB5c]; `weather.js` only dispatches to them:
`places.js: openPlaces(ctx)`, `confirmPlace(ctx, p) → Promise<"add"|"look"|null>`; `days.js: openDay(ctx, key)`;
`warnings.js: openWarning(ctx, w)`; `wxui.js: openDetail(ctx, kind)`, `openCredits(ctx, which)`; `wxsettings.js:
openSettings(ctx, page)`. Section views share one signature: `view(el, ctx) → { draw(), hide(), destroy() }`, `ctx = {
S, core, fw, open: { places, confirm, day, detail, warning, credits, settings } }` (the openers, bound).

| File | Owner | What |
|---|---|---|
| `weather.js` | WX | entry: CONTRACT/BUILD/NEWS/SECTIONS; `mount` builds four section containers (`section.wx-sec[data-sec]`), wires core events to the section views, sets the header (title = place, ▾ → Places, line "14° · rain from 15:00", `compactTitle` "London · 14°", acts: **Weather Settings only** [UI3], `badges.warnings` = warnings in force), `show(route, hint)` (section, `#day=` → `openDay`, `#settings[=page]` → `openSettings`, query → `core.fromLink`), `hide`, `busy`, `sendable`, `unmount`; registers the module's search provider |
| `connector.js` | WX | §6.1 (B0 writes `files` complete; WX keeps it so) |
| `core.js` | WX | port of `app.js` state and pipeline: `S`, `defaults`, `CARDS`, `layoutOf`, `solarOf`, `notifyOf`, `loadSettings`, `saveSettings`, `place`, `addPlace`, `removePlace`, `movePlace`, `setPlace`, `go`/`refresh` (via `data.js load`), `tuned`, `shaped`, `radarRain` hook (rain files through `fw.lazy`, D2), `snapshotNow`/`baseline`, `locate`, `fromLink`, `sectionOf`, `peek(place)` (from `wx:glances`), first-run place (`/api/weather/where`, else London `standin`), 60 s tick while visible; events `on("wx"|"place"|"settings"|"acct"|"loading"|"error"|"ask")`. **`saveSettings(patch)` starts from the whole stored `wx:settings` and changes only the keys given**, so fields the module doesn't draw (`glass`, and any other) survive every save and sync [RI6]. **`fromLink` never asks** for a place near one in `wx:places` or in the account's places (`wx:acct`); it asks only for a place found in neither [UI5]. |
| `sync.js` | WX | port of `app.js` 3244–3378: `SYNCED`, `canon`, `mine`, `snapOf`, `sameAs`, `combine`, `takeUp`, `inStepSoon`/`keepInStep`/`stepOnce`, `pull`, `adopt` (hub branch: `standIn` and `hubFirst` as at the hub), `signedOut`; UI calls replaced by core events; 401 / `{signedIn:false}` → `await fw.session.lost()`; `false` → core `error` event "Couldn’t sync with your account" (D3); no subscription calls (You owns notifications) |
| `places.js`, `wxcore.css` | WX | Places sheet: your places as one-tap rows at the top, the current one ticked, each with its temperature from `core.peek` [UI8]; Edit (delete, reorder by Move Up/Down buttons with an `aria-live` line); "Find a place" (`data.js searchPlaces`; its field is focused synchronously in the tap that opens it [UI10]); "Use My Location" via `core.locate`. `confirmPlace(ctx, p)` sheet ("Add “X” to your places?" Add / Just Look). `wxcore.css`: the Places and confirm sheets' rules under `.m-weather` and `.ifl-sheet[data-app=weather]` |
| `radarview.js`, `radar.css` | WX | Radar section **[RB3, UB1]**: stamps the radar card markup Weather's `radar.js` expects (`.radar-map`, `#radar-said`, `.radar-wrap`, `.radar-play`, `.radar-slider`, `.radar-time`, `.radar-status`, `.radar-chip`, `.radar-hint`, `.radar-scale`, `.radar-legend`, `.card-title`, `.radar-note`; no `.radar-full`), map in `[data-no-edge]`; `fw.fill(true)` on show; `fw.lazy(() => import("../radar.js"))` on first show; `radar(card, { full: false, explore: true, light: fw.theme() === "light" })`; on `fw.on("theme")` it destroys and rebuilds the map [UI9]; feeds `place/others/warnings/mark` from core; `hide()` pauses; after 5 minutes out of sight `destroy()`, rebuilt on next show [RI11]; `unmount()` calls `destroy()`; offline → "Radar needs a connection"; Send = the forecast card. **Layout**: the map fills from `--hd-h` to the top of the tab bar; play, slider, time and status sit as an overlay above `--tabs-h + safe-bottom + 8px`; `#radar-said` a glass overlay at the top; legend chip and Send in the overlay; nothing below the map; at ≥ 980 px the map is full width up to 1180 px. `radar.css` = the radar rules of `weather/styles.css` l.1451–1798 ported under `.m-weather`, white literals turned into tokens, Leaflet's dark filter only in the dark theme, no `.radar-big` |
| `now.js` | WV | Now section: hero (`.wx-hero`, same markup/classes as Today's weather card: `.tcard.wx.wx-sk-<sky>`, place clock, temp, icon, condition, H/L, `I.headline` brief, Send button; uses `hint.sky` until its own forecast arrives; `fw.zoomTarget`); **status in the hero line**: loading, "Offline · from 09:40" when stale, an error with Retry as a hero action [UI8]; **the warnings slot straight under the hero** (`.wx-alerts`, `cards()`'s logic: one card for one warning, a banner "2 warnings · Amber wind, Yellow rain ›" for more; tap → `fw.nav.section("warnings")`) [UB2]; then the cards in `S.settings.layout` order/off, skipping `daily` and `radar` (they are sections here): Next 4 hours, Solar (if on), Next 48 hours (strip + `charts.timeChart`, metric `ifl-seg-sm` Temp/Rain/Wind), Right now (`ifl-stats` tiles; tap → detail sheet), Highlights (insights rows), Best times, This time of year, Forecast accuracy; the "ask" card when sync asks about this device's places; foot: "Updated n min ago · Refresh" and **the credits line** "Learn more about weather data and map data" (`.wx-credits`, → `openCredits`) [UB6]. At ≥ 980 px two columns of cards (max width 1100 px) [UI8] |
| `days.js` | WV | 16 Days: **"Days by" Temp / Rain / Wind** `ifl-seg-sm`, with the range bar by mode [UI8]; `ifl-row`s (day name column, icon, words, rain chance, range bar); `openDay(ctx, key)`: that day's hourly chart and parts-of-day words, prev/next buttons |
| `warnings.js` | WV | Warnings: official warnings in force (colour chip, title, span, issuer), alert-level insights; `openWarning(ctx, w)`; empty states [UB2]: `wx.official` is `[]` → "No warnings for <place>. You’ll hear about any here, and on Today."; `wx.official` is `null` (no official feed covers the place) → "Official warnings aren’t available for <place>. Check your national weather service." |
| `wxui.js` | WV | Weather pieces on framework components: `skyClass(wx, now)` → one of the 14 `wx-sk-*`, hour strip, range bar, `openDetail(ctx, kind)` (ported from `detail.js` content builders l.39–250), `openCredits(ctx, which)`: a Credits sheet whose text is ported verbatim from `weather/index.html` `#credits` (every provider, licence link and the "forecasts can be wrong" note), icon helpers |
| `weather.css` | WV | everything under `.m-weather` for the sections, including the hour strip and chart rules ported from `weather/styles.css` l.700–762 (`.strip`, `.hour`, `.c-*` tooltip/grid) re-tokenised; tokens only (no white literals outside the hero); light-theme cloud fix `.m-weather svg [fill="#EEF3F9" i] { fill: var(--cloud-glass) }` outside `.tcard.wx`; Weather data colours with graphics and text values per mode (`map-design` §9) |
| `wxsettings.js`, `wxsettings.css` | WS | `openSettings(ctx, page)`: Weather Settings sheet with pages (sheet `push`): Units (temp, wind, precip, pressure, clock), Arrange Now (order with Move Up/Down + `aria-live`, show/hide; **`daily` and `radar` not listed, their positions and off-state left untouched in `layout`** [UI8]), Best Times (activities list and one activity's limits), Commute (on, morning, evening), Solar (on, alert, zones with place, faces, pitch, kW), Forecast (tune, laundry, stars, sunset), and a Notifications row → `/#you=notify-weather` (You's Weather Notifications sheet, §4.3) [UB3]. No Look/Glass page (gone under the roof; `glass` kept by `saveSettings`). Saves through `core.saveSettings(patch)` (→ `wx:settings` + account sync). `wxsettings.css`: the pages' rules under `.ifl-sheet[data-app=weather]` |

Reused as they are (imported from `../`, static): `data.js`, `insights.js`, `format.js`, `codes.js`, `climate.js`,
`sky.js`, `skill.js`, `solar.js`, `official.js`, `agree.js`, `account.js`, `send.js`, `charts.js`, `icons.js`. Lazy
through `fw.lazy`: `rainmap.js`, `radarrain.js`, `radar.js` (and its `radarmix.js`, `radarwork.js`, `mapstyle.js`,
`mapgl.js`/`mapleaf.js`, `vendor/`).

Reused with small backward-compatible changes (WX; standalone behaviour identical by default, proven by `wxapp` and
`wxradar`):
- `radar.js` [RB3, UB1, UI9]:
  - `opts.full === false` → no full-screen button, no `big()`/`grow()`, no document Escape listener; **every use of
    `full` (`q(".radar-full")`) guarded**, so the markup without it doesn't throw.
  - `opts.explore === true` (used with `full:false`) → the map always explores: `map.explore(true, touch)` when made and
    on every resize; `.radar-hint` hidden; a tap on the map reads the place (`readAt(pt)`) and a tap on an "other place"
    bubble goes there (`o.go()`), never `grow`; zoom buttons act directly.
  - `opts.light` (boolean) → the map's light/dark style; default the media query as now.
  - `destroy()` added to the returned API (removes every window/document listener it added, disconnects its observers,
    terminates its Worker, `map.remove()`).
  - nothing else changes.
- `mapgl.js`, `mapleaf.js`: vendor URLs via `new URL("./vendor/…", import.meta.url).href` (same URL as before at both
  `weather.inflite.ai/` and the hub's `/weather/`, correct at `inflite.ai/`).

Not carried (stay in standalone only): sky page, places pager and its duplicate rendering, pull-to-refresh, collapsing
top bar, sheet chrome, sign-in hand-off, InFlite menu copy, early/boot scripts, Weather's own SW, notifications
subscription, copy/contextmenu blocking, pointer lit-glass, place swipe (D19; Q4).

### 7.2 Storage (identical keys and shapes to `weather/app.js`)

`wx:settings`, `wx:places`, `wx:cur`, `wx:acct`, `wx:hero` (written for compatibility, as `keepHero` does),
`wx:glances`, `wx:said:<cell>`, `wx:snap2:<cell>`, `wx:<cell>`, `skill4:<cell>`, `clim2:<cell>`, `climf:*`, `clim:*`,
`radarfc:*`, `radarhr:*`, `radarfld:*`, `wx:mapgusts`, `wx:maplayer`, `wx:chartw`. **No new key.** So: a user who had
Weather at the hub keeps places and settings; turning roof off returns them to milestone 1's page with the same data;
Today's sign-out (`APP_KEPT`, `forgetApps`) already clears them (`todaykept.test`).

### 7.3 Performance [RB7, RI5]

- First open, warm HTTP cache, 4G: skeleton (with the card clone) in the same frame as the tap; Now from the kept
  forecast ≤ 600 ms after the module's files are in; ≤ 1.2 s from the tap, modulepreloaded.
- Cold deep link `/weather/#radar` (empty cache, signed in, stub network latency of the test stack): Now/Radar skeleton
  ≤ 1.5 s, recorded and asserted by `roofweather`.
- Transfer budget for the first open (excluding the radar stack and the lazy rain files): module JS ≤ 90 KB gzip
  (the 14 reused ≈ 52 KB gzip minified today; the module's own ≤ 35 KB), CSS ≤ 14 KB gzip. **Requests:** same-origin
  `/weather/` JS/CSS requests on the first open ≤ `connector.files.length + 2` (the static graph is 30 files: 12 own, 14
  reused, 4 CSS); API calls, `/weather/version`, third parties not counted. Radar adds the radar stack (≈ 41 KB gzip)
  and maplibre (as at the hub today) on first Radar.
- No per-card backdrop blur; charts drawn only for the visible section; the 60 s tick only while Weather is shown and
  the page visible.
- `roofweather` records the bytes and request count of the first open and of the cold deep link, and fails over budget.
  Today's own time to first card (with the frame) is logged by `roofshell` against `todayshell`'s figure, not gated.

### 7.4 Notifications and settings

Weather's notifications are already delivered through InFlite (`HUB_PUSH=1`) and configured in You (Notifications by
App, and the Weather Notifications sheet, §4.3, through `/api/notify`); the module shows none of its own, and its
settings sheet links there. The module still carries `settings.notify` unchanged through sync (`places`, `brief`,
`briefAt`, `email`), keeping the device fields (`endpoint`, `devId`, `syncedAt`, `off`) as `app.js` does. The solar
alert stays in Weather Settings, Solar (it lives in `settings.solar.alert`).

---

## 8. Server, service worker, sign-in, degraded, versions, privacy (SV unless named)

### 8.1 `today/src/roof.js` (new) and `hub.js`

```js
export const ROOF_DOCS = /^\/weather\/(index\.html)?$/;
export const ROOF_FILES = /^\/weather\/roof\//;
export const roofOn = (env) => env?.ROOF_OFF !== "1";
export const PAGE_HEADERS = { "Content-Security-Policy": <§8.3>, "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin", "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Cache-Control": "no-cache", "X-Robots-Tag": "noindex" };
export async function roofPage(request, env)   // env.ASSETS.fetch(new Request(new URL("/", request.url), { method })): no conditional headers passed, so always a full 200; PAGE_HEADERS SET over whatever assets sent (never two CSPs); HEAD → no body
export const RETIRE_SW = "…";                   // §8.4
export function retireWorker()                  // 200 text/javascript; charset=utf-8, Cache-Control: no-cache, nosniff
```
`hub()`: after `/api/hub`, before the `HUB_KEY` check: `if (read) { if (roofOn(env)) { if (ROOF_DOCS.test(p)) return
roofPage(...); if (p === "/weather/sw.js") return retireWorker(); if (p === "/weather") return 301 /weather/ + search }
else if (ROOF_FILES.test(p)) return 404 (no-store) }` [RB6b]. Non-GET/HEAD to `/weather/` → 405 as now. `/api/hub` →
`json({ ready, roof: roofOn(env) })`. Header comment l.13 updated ("never the assets binding, except the framework's page
for /weather/"). Everything else in hub.js unchanged.

### 8.2 `today/public/sw.js` (root worker)

- `SHELL = "today-app-3"`; `FILES` += `/roof/frame.js`, `router.js`, `header.js`, `tabs.js`, `sheet.js`, `toast.js`,
  `ui.js`, `search.js`, `send.js`, `modules.js`, `connectors.js`, `roof.css`.
- Navigations: key `/` for `/`, `/index.html` (fetch and keep, as now); for `/weather/`, `/weather/index.html`: fetch,
  and on network error or 5xx answer the kept `/`; **never** `put` a `/weather/` response.
- `{ifl:"keep", app, build, files}` from a client of this origin: `app` in `["weather"]`, `build` `/^\d+\.\d{2}$/`,
  files same-origin paths under `/weather/roof/` or `/weather/` (no `vendor/`, no query, ≤ 60): fill
  `roof-<app>-<build>` (each `fetch` must be `ok` and `basic`; any failure deletes this cache and keeps the previous),
  then delete other `roof-<app>-*`.
- Fetch: GET under `/weather/` that is not a navigation, not `/weather/sw.js`, not `/weather/version`, no query →
  network first; on error or 5xx, the match in `roof-weather-*` (a 404 from roof off is passed through, not replaced).
- `activate` deletes old `today-app-*` (as now); never touches `wx-*` (the retiring worker does) or `roof-*` of the
  current build.
- `openIn(path)`: pick the window as now; if its URL path is `/`, `/index.html`, `/weather/` or `/weather/index.html`,
  `told(win, path, "route")` (expects `{ifl:"routed"}` in 1 s); otherwise `told(win, path, "open")` as now; not heard →
  `win.navigate` / `openWindow` as now (hub not ready → `/#go=`).

### 8.3 Page CSP and Permissions-Policy

`_headers` `/*` and `PAGE_HEADERS` carry the same CSP (a unit test compares them):
`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tilecache.rainviewer.com
https://tile.openstreetmap.org https://tiles.openfreemap.org; font-src 'self'; connect-src 'self'
https://api.open-meteo.com https://ensemble-api.open-meteo.com https://air-quality-api.open-meteo.com
https://marine-api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com
https://previous-runs-api.open-meteo.com https://api.bigdatacloud.net https://nominatim.openstreetmap.org
https://api.rainviewer.com https://tiles.openfreemap.org; frame-src 'self'; manifest-src 'self'; worker-src 'self';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`, and `Permissions-Policy: camera=(),
microphone=(), geolocation=(self)`. The origins are exactly MAIN `functions/_wxapp.js` `CONNECT` (minus
cloudflareinsights) and `IMAGES`; the test reads both files. No `'wasm-unsafe-eval'`, no `unsafe-inline`. `_headers`
also gains `/roof/*  Cache-Control: no-cache` [RI14].

### 8.4 Retiring Weather's worker at `/weather/`

`RETIRE_SW`: `install` → `skipWaiting()`; `activate` → delete every cache whose name starts `wx-`, then
`registration.unregister()`, then `clients.matchAll({ type: "window" })` → `navigate(client.url)` for those whose
path starts `/weather/`. No `fetch`, `push` or `message` handlers. Served only at the hub, only with roof on; MAIN's
`weather/sw.js` is unchanged (standalone and roof-off). Plus the page's unregister in `start()` (D10). Order of
effects for a phone that opened Weather at the hub in milestone 1: it opens `/` (framework) → `/api/hub` says roof →
old registration unregistered → `/weather/` navigations reach the root worker/network → framework. If it taps a
`/weather/` notification first: the old worker may serve its old page once, its update check installs `RETIRE_SW`,
which navigates the page again → framework.

### 8.5 The off switch: `.github/workflows/roof.yml` + `.github/hub/hub.sh` [RB6a]

`workflow_dispatch` input `state: off | on` (and `where: inflite.ai | next.inflite.ai | both`, default both), same
concurrency group as hub-*.yml (`inflite-hub-key`), token check as hub-off.yml. `hub.sh` gains:
- `worker_settled <worker>`: reads the Worker's active deployment and its newest uploaded version (the same Cloudflare
  API `hub.sh` already calls); if the newest version isn't the deployed one it fails with words saying exactly what to
  do, as `give_key` does ("Cloudflare won't change this Worker's secrets until its production branch is deployed again
  … or use rollback level 2"), and **nothing is changed**;
- `roof_set <worker> <off|on>` (after `worker_settled`: `wrangler secret put ROOF_OFF` with value `1` from stdin, or
  `wrangler secret delete ROOF_OFF --force`; a missing secret on delete is success). Never `wrangler versions secret
  put` (it builds on the newest version, which may be another branch's);
- `wait_roof <site> <true|false> <secs>` (polls `/api/hub` for `roof`).
A secret change makes a new version of the same code: seconds, no build. Recorded line in the step summary. When
`worker_settled` refuses, the step summary names rollback level 2 (§11.2) as the way.

### 8.6 Sign-in, degraded, versions, privacy

As D12–D16, D21, D23. Test hooks: none new on the server.

---

## 9. Batches

### 9.1 Order

```
B0 contracts (serial)
  ├─ wave 1 (parallel): FW framework · SV server+worker+switch · WX Weather core · Q acceptance tests
  │     (FW merges in two parts: FW-a = frame, router use, header, tabs, sheet, toast, ui, roof.css, kit page;
  │      FW-b = search, send, modules, connectors, roofkit complete)
  ├─ wave 2 (parallel): TD Today/Apps/You (after FW-a; its last roofshell run after FW-b) · WV Weather views (after FW-a and WX)
  │                     · WS Weather settings (after FW-a and WX)
  └─ I integration (serial)
```
Rolling merges into `claude/one-roof` by the integrator as each goes green. A batch may merge `claude/one-roof` into
its branch at any time; it never edits another batch's file.

### 9.2 Ownership (each file has exactly one owner; ❄ = frozen after B0)

| Batch | IFL | MAIN |
|---|---|---|
| B0 | `today/public/roof/router.js` ❄; first versions (stubs) of every other `roof/*.js` and `roof.css` (token block ❄) → FW | `weather/roof/*` stubs → WX/WV/WS as §7.1; `.tools/tests/roofhooks.mjs` ❄; `.tools/tests/unit/fixtures/roof.mjs` ❄ (`roofSkip`, paths); `unit/roofrouter.test.mjs` ❄, `unit/roofcontract.test.mjs` ❄; the split of `unit/todayfiles.test.mjs` (→ SV) into it and `unit/roofpage.test.mjs` (→ TD) |
| FW | `roof/frame.js header.js tabs.js sheet.js toast.js ui.js search.js send.js modules.js connectors.js roof.css` (token block may only gain) | `.tools/tests/roofkit.mjs`, `.tools/tests/roofkit/**`, `unit/roofsearch.test.mjs`, `unit/roofui.test.mjs` |
| SV | `today/src/hub.js`, `today/src/roof.js`, `today/public/sw.js`, `today/public/_headers` | `.github/workflows/roof.yml`, `.github/hub/hub.sh`, `.tools/tests/hubstack.mjs`, `.tools/tests/wxhub.mjs` (first line only), `.tools/tests/hubserve.mjs`, `unit/hubworker.test.mjs hubheaders.test.mjs todayworker.test.mjs todayfiles.test.mjs todaysw.test.mjs rootsw.test.mjs roofserve.test.mjs` |
| WX | – | `weather/roof/weather.js connector.js core.js sync.js places.js radarview.js wxcore.css radar.css`; `weather/radar.js mapgl.js mapleaf.js`; `unit/roofwxcore.test.mjs`, `unit/wxradar.test.mjs`; `.tools/tests/roofwxmount.mjs` |
| Q | – | `.tools/tests/roofweather.mjs roofnav.mjs roofsw.mjs rooflib.mjs`; Weather-page assertions in `hubpush.mjs todaymoments.mjs hubshare.mjs` |
| TD | `today/public/app.js index.html app.css apps.js you.js cards.js` | `.tools/tests/roofshell.mjs todayshell.mjs todaypage.mjs todayphases.mjs mocks/todaystub.mjs`, `unit/roofpage.test.mjs`, `unit/todaydaypage.test.mjs` |
| WV | – | `weather/roof/now.js days.js warnings.js wxui.js weather.css`; `unit/roofwxviews.test.mjs` |
| WS | – | `weather/roof/wxsettings.js wxsettings.css`; `unit/roofwxsettings.test.mjs` |
| I | – (only BUILD/NEWS in `app.js`, README) | `suite.txt`, `.tools/tests/README.md`, `min/**`, `weather/sw.js` SUMS/CACHE, every BUILD/NEWS; may trim `connector.files` to the exact graph at the end (§9.4 I) |

### 9.3 Rules for every batch

- Worktrees `/home/user/up4/roof/wt/<b>/{georgefarrowgreen,inflite}` on `roof/<b>` off `claude/one-roof` (handoff.md
  "Set up"); unit baseline first (`node --test .tools/tests/unit/*.test.mjs` in MAIN, IFL beside it).
- Only owned files. No version bumps, no `minify.mjs`/`wxshell.mjs`/`iflmenu.mjs` runs, no `suite.txt` edits, no push.
- Until I, these unit tests may be red only for files the batch changed: `min.test.mjs`, `wxshell.test.mjs`. Every
  other unit test green (pass/fail/skipped counts reported).
- **Two IFL states [RB4].** Every MAIN unit case that needs the roof in the IFL beside skips with `roofSkip` (from
  `unit/fixtures/roof.mjs`: true when `../inflite/today/public/roof/router.js` doesn't exist) and says why; a rewritten
  case keeps its milestone-1 assertion under `!roofSkip`'s opposite, so both IFL states stay covered.
- `node --check` on every changed `.js`/`.mjs`.
- IFL changes: `cd <W>/inflite && npx wrangler deploy --dry-run --outdir <scratch>/roof/dry-<b>` succeeds.
- e2e only through `tf/e2e.sh <W>/georgefarrowgreen <b> <tests…>`, only the tests named; `FAILS 0` passes, `SKIPPED`
  doesn't. Tests select DOM only through `roofhooks.mjs` (§3.14).
- Privacy rule 6; no inline styles; every string from data through `textContent`/`esc()`.

### 9.4 The batches

**B0 · Contracts** (serial; IFL + MAIN)
- Writes: IFL `roof/router.js` ❄ (complete: §3.3, including tab `arg`), stubs of every other `roof/*.js` with final
  exports and contract comments (no-op or minimal bodies; `createFrame` returns an `F` whose methods exist), `roof.css`
  with the token block ❄ (§3.13 names and accent values; components empty). MAIN `weather/roof/weather.js` (CONTRACT,
  BUILD, NEWS, SECTIONS ❄; `mount` returning a placeholder instance), `connector.js` (final shape; `shares` words ❄;
  `files` = the 30-file list of §6.1/§7.3), `core.js` stub (exports and `S` shape ❄: `{ settings, f, places, cur, wx,
  now, loading, error, stale, acct, ask, updatedAt }`, event names ❄, `saveSettings(patch)`, `peek`), stubs of
  `sync.js`, `places.js`, `radarview.js`, `now.js`, `days.js`, `warnings.js`, `wxui.js`, `wxsettings.js` with the
  section-view signature ❄ and the openers ❄ (§7.1); each stub statically imports the reused files its real version will
  use (so the graph is the agreed one from the start) and exports `STUB = true` (removed by the owner with the real
  code); empty `weather.css`, `wxcore.css`, `wxsettings.css`,
  `radar.css`. `roofhooks.mjs` ❄ (§3.14 as exported constants). `unit/fixtures/roof.mjs` (`roofSkip`, `IFL`, `MAIN`).
- Moves, unchanged, the two page-structure cases of `todayfiles.test.mjs` ("nothing Today draws has an inline style or
  an inline script…", "its page is InFlite’s one page…") into a new `roofpage.test.mjs` [RB5a].
- Tests: `roofrouter.test.mjs` (every URL in D6 and §3.3 both ways, `#you=<id>`, the combined query + hash; foreign
  origins, `//x`, control characters, long query, roof off → null), `roofcontract.test.mjs` (framework exports; module
  exports; `BUILD`/`NEWS` equal to `weather/app.js`; `SECTIONS` = `REGISTRY.weather.sections` = `connector.sections`;
  `REGISTRY.weather.css` ⊆ `connector.files`; every `connector.files` entry exists; **the static import graph from
  `weather.js` ⊆ `connector.files`**, and no file of the radar stack, `rainmap.js`, `radarrain.js` or `vendor/` in it; no
  `import(` outside `fw.lazy(`; the grep rules of §5.1; no `:root|html|body` selector in `weather/roof/*.css`; no
  `style=`/`setAttribute("style"` in either folder; IFL cases skip with `roofSkip`/no IFL).
- Done when: unit suite green + B0's cases; dry run ok; `todayshell`, `todaypage` FAILS 0 (nothing user-visible
  changed).

**FW · Framework** (wave 1)
- Provides §3 and §5.2 exactly. Consumes: router (B0), `IFL` (the shared block, unchanged).
- Kit page (FW-a): `.tools/tests/roofkit/index.html` loads the real shared block (extracted from IFL
  `today/public/app.js` between its markers) and IFL `today/public/` files from disk, a signed-in `F.session` with `hub:
  true, roof: true`, three stand-in tab screens and `fake-module.js` (four sections) / `fake-connector.js`; with
  `?module=<entry path>` it mounts a real module instead, so WX, WV and WS can see their screens before TD lands.
- roofkit: Playwright serves the kit page at `http://kit.test` with the page CSP of §8.3 (any CSP violation fails);
  drives: tab screens and the fake module; header states (root/app, crumb, pick, acts, compaction `--p`,
  `compactTitle`, badges, Back label; "Weston-super-Mare" and "Newcastle upon Tyne" at 320 and 390 with Back, title and
  capsule not overlapping and the full title in `aria-label`); switcher keyboard (manual activation) and lens
  (recomputed on show); tab pill (`has-pill`, no static pill under it), Apps from inside the app (back when previous is
  Apps, else push), current tab → top; Back rule (sheet, module back, history, cold deep link → `/#apps`, wiped state
  re-stamped: a tab screen, then `#morning`'s `replaceState(null…)`, then Back); scroll restore with
  `scrollRestoration` manual and per section; transitions with and without VT, with reduced motion, and skipped on
  `hasUAVisualTransition`; zoom with a card clone (callback synchronous); `fw.fill`; sheets (focus trap, Escape, drag,
  push/pop, accent scoped and reset, `page.goBack()` with a sheet open leaves no `dialog[open]` and the shown route =
  `location`); address tidied after `show` (query and `#day=` gone); toast with action (pause on focus); search
  (keyboard focus in the tap, providers, slow and throwing provider, Enter, no `fetch`, nothing in storage/URL);
  module load failure → error with `retry`/`own`, second failure → `reload`; contract mismatch; `fw.lazy` while stale
  reloads at the route without running the import; `lost()` with a session that is still signed in → no sign-out;
  axe (no serious/critical); 320, 390, 768, 1280 widths; light and dark.
- Done when: unit green (`roofui`, `roofsearch`, budget); `roofkit` FAILS 0; dry run ok.

**SV · Server, worker, switch** (wave 1)
- Tests: hubworker (document rule with and without key; `ROOF_OFF`; `/api/hub` roof; `/weather/sw.js` retiring only with
  roof on; `/weather/roof/*` 404 with `ROOF_OFF=1`, forwarded without cookie otherwise; `/weather/app.js`,
  `/weather/version` still forwarded; POST `/weather/` 405); todayworker (the `/weather/` document reaches assets by
  design when the roof is there, the milestone-1 assertion under `roofSkip`; files never); todayfiles (CSP =
  `PAGE_HEADERS` = MAIN `_wxapp.js` lists; no other `https:`; geolocation self; `/roof/*` no-cache; `today-app-3` files);
  todaysw/rootsw (`/weather/` navigation fallback without put; keep message validation and all-or-nothing; module files
  network-first + fallback, a 404 passed through; `{ifl:"route"}` to framework windows, `open` to others; not heard →
  navigate); roofserve (`RETIRE_SW` in a fake SW global: caches `wx-*` deleted, others kept, unregister, clients under
  `/weather/` navigated; `roofPage`: headers set over an assets CSP (one CSP), a request with `If-None-Match` still 200
  with body, HEAD no body, body = assets `/`); hubserve (Weather part: `/weather/` = framework page (marker `content="/"`,
  `PAGE_HEADERS`, no hub marker `/weather/`), module files from the weather host with neither cookie nor bearer,
  `/weather/sw.js` retiring, `/weather/version` = MAIN BUILD; Fitness/Markets/Chats unchanged).
- Done when: unit green (both IFL states, §9.3); dry run ok (prod and `--env next`); e2e `hubserve` and `wxhub` (now
  roof-off) FAILS 0; `bash -n .github/hub/hub.sh`; `roof.yml` parses (`node -e` YAML-free check: the job names, the
  `worker_settled` and `roof_set` calls present) and a dry run in the i0 workflow harness (`tf/i0-wfsim.py`) with stubbed
  `wrangler` and API: settled → secret set; not settled → refused, nothing changed.

**WX · Weather core** (wave 1)
- `roofwxcore.test.mjs`: extract from `weather/app.js` by name (brace-matched source of `layoutOf`, `solarOf`,
  `notifyOf`, `canon`, `snapOf`, `sameAs`, `combine`, `mine`'s body, `defaults`, `CARDS`, `SYNCED`, `loadSettings`)
  and evaluate with injected `A` (`account.js`), `S`, `IFL.hub.on = true`; assert identical outputs to
  `core.js`/`sync.js` on fixtures (damaged settings, old one-place notify, more than `MAX_NOTIFY`, stand-in places,
  merges with conflicts); `takeUp` writes the same `wx:*` values as app.js would; `saveSettings({ units… })` keeps
  `glass:"clear"` and every other stored key; `core.fromLink` rules (near 0.02°, gps near 0.2°, name sanitised ≤ 60;
  a place in `wx:places` or `wx:acct` switches; confirm only for a new one).
- `wxradar.test.mjs`: `full:false` (no `.radar-full` in the markup: no throw, no Escape listener), `explore:true`
  (explore on at creation and resize, hint hidden, tap → read, bubble → go), `light`, `destroy()` (listeners, observers,
  worker, map), defaults unchanged.
- `roofwxmount.mjs` (new e2e, no hub): FW's kit page with `?module=/weather/roof/weather.js`, MAIN `weather/` and IFL
  `today/public/` served from disk at `http://kit.test`, third parties stood in with `wxhub.mjs`'s routes,
  `/api/weather/where|warnings|obs|me` and `/api/session` by a small stub in the test. Checks: mount; the four sections
  show (B0's view stubs until WV lands); header title = place, compactTitle, ▾ opens Places (one-tap rows with ticks and
  temperatures, switch, find via stand-in geocoding, delete, reorder with the live line, My Location with a granted
  fake geolocation); `?lat&lon&name` known or in `wx:acct` → switch, new → confirm sheet; Radar: in a `hasTouch: true,
  isMobile: true` context a drag and a pinch change `map.state()` zoom and centre, a tap gives a reading, the window
  doesn't scroll (`html.ifl-fill`); under `data-theme="dark"` with `colorScheme: "light"` the dark map style;
  `unmount()` leaves no window/document listener the module added (instrumented `addEventListener`/
  `removeEventListener`); a settings change sends `PUT /api/weather/me` with the same body `app.js` would, `glass` kept;
  a 401 from `/api/weather/me` with `/api/session` still signed in → no sign-out, the "Couldn’t sync" line. It also
  carries a **views part** (WV's: hero, warnings slot, credits, 16 Days with Days by, day/detail/warning sheets, empty
  states) and a **settings part** (WS's: every Weather Settings page opened and saved through §3.14's hooks), each run
  only once the files it covers no longer export `STUB`, else logged as skipped (not a failure); so WV and WS prove
  their work without editing WX's test.
- Done when: unit green; `roofwxmount` FAILS 0 (after FW-a is merged into its branch). `wxapp`, `wxacct` (standalone
  unchanged by the radar/map edits) need Weather's `SUMS` regenerated, which only I may do: I runs them right after
  merging WX (minify + wxshell first) and returns any failure to WX; WX proves the defaults with `wxradar.test`.

**Q · Acceptance tests** (wave 1 writes, run from wave 2 and in I)
- `rooflib.mjs`: helpers (page-alive marker, main-frame navigation counter, push/replace recorder, budget meter, Weather
  third-party stand-ins reused from `wxhub.mjs` and `mocks/wxappdata.mjs`, standalone emulation (`navigator.standalone`
  and `matchMedia('(display-mode: standalone)')` in an init script), a "never navigated to weather.inflite.ai" guard,
  and `launch()` honouring `BROWSER=webkit` when that browser is installed [RI12]).
- Writes against §3.14's hooks only. Each step names the spec section it proves.
- Done when: each parses (`node --check`); once TD, WV, WS, SV merged: all three FAILS 0 (run by Q in wave 2, by I at the
  end).

**TD · Today, Apps and You** (wave 2, after FW-a)
- `roofpage.test.mjs`: B0's moved cases, updated for the new index.html (the frame's hosts, dialogs as `ifl-sheet` with
  the frozen markup, `dialog#sh-wxnotify`, `/roof/roof.css` linked, `<link rel=modulepreload>` for each static
  `roof/*.js`, no inline style); app.js imports only `/roof/frame.js`, `router.js`, `header.js`, `tabs.js`, `sheet.js`,
  `toast.js`, `ui.js`, `search.js`, `send.js` statically.
- roofshell: framework on Today: header per tab (crumb date, Edit), photo → InFlite's menu with Connected Apps, tab
  pill, Apps minis (weather num+bars from the fixture, markets pct, no amounts), You Connected Apps (words per app) and
  each connector sheet, Weather Notifications sheet (per-place chips, briefing, email: the `PATCH /api/notify` bodies
  seen), `/#you=notify-weather`, search providers (Today titles, People names, Settings rows; typing leaves nothing in
  storage or URL), sheets (Morning, Every App's, Edit) as dialogs, toasts, Back/history between tabs, `#morning` then
  Back, signed out at `/weather/#radar` → way in with `then=` in both href and click, degraded (explicit `ready:false`):
  Weather tile → own address, `/weather/` document → replace to own address; **`/api/hub` answering after 3 s at
  `/weather/#radar`: no navigation away, Weather opens** [RB1]; `/api/hub` without `roof` → milestone-1 links; hub ready
  but module files unavailable (stub stack) → Weather error state with both actions; the old `/weather/` registration
  unregistered while signed out; Today's warning chip href `…#warnings`; time to first card logged; CSP clean; axe;
  widths; light/dark.
- Edits: todayshell (header assertions → framework header; tiles/chips hrefs unchanged; `/api/hub` stub answers
  `roof`), todaypage (header and toast selectors), todayphases (Radar click: in-page route, URL `/weather/#radar`, one
  page; the routed stand-in becomes a module stand-in or the error state), todaydaypage (the chip href).
- Done when: unit green; `roofshell`, `todayshell`, `todaypage`, `todayphases` FAILS 0 (roofshell's last run after FW-b
  is merged); dry run ok.

**WV · Weather views** (wave 2, after FW-a and WX)
- `roofwxviews.test.mjs`: `skyClass` for every code × day/night × dusk/dawn; range bar maths per Days-by mode; detail
  builders' text against `detail.js` on fixtures; warnings slot (one card / banner text); empty-state choice for
  `official` `[]` vs `null`; the credits text contains every provider and licence named in `weather/index.html`
  `#credits`.
- Done when: unit green; `roofwxmount` FAILS 0 with its views part running (not skipped); `roofweather` FAILS 0 once TD and SV are merged
  (else the integrator runs it); screenshots at 320/390/768/1280 light and dark in `tf/state-wv/out/roofweather/`
  reviewed against the demo.

**WS · Weather settings** (wave 2, after FW-a and WX)
- `roofwxsettings.test.mjs`: each page's save writes the same `wx:settings` shape `app.js loadSettings` accepts (run
  through the extracted `loadSettings` from `roofwxcore.test`'s extractor); a Units save keeps `glass` and the
  `layout` positions/off of `daily` and `radar`.
- Done when: unit green; `roofwxmount` FAILS 0 with its settings part running (not skipped); `roofweather`
  part 6 FAILS 0 once TD and SV are merged (else the integrator runs it).

**I · Integration** (serial)
- Merges in wave order; resolves only merge mechanics (any behaviour conflict goes back to the owner). Right after
  merging WX: `minify.mjs` + `wxshell.mjs`, committed, then e2e `wxapp wxacct`.
- Versions: `weather/app.js` `BUILD = "1.65"`, `NEWS = "Weather opens inside InFlite at inflite.ai: Now, 16 Days,
  Radar and Warnings under one header and tab bar"`; same in `weather/roof/weather.js`; `today/public/app.js` `BUILD =
  "1.10"`, `NEWS = "Today, Apps, You and Weather now share one header, one tab bar and one search, and Weather opens
  right here"` [UI11]. Mail, Chat, Fitness, Markets, Account unchanged (no files changed).
- `connector.files` trimmed to exactly the static graph + CSS if it lists more (the one change I may make in a batch's
  file; `roofcontract` then also checks equality, by I).
- Generated: `node .tools/minify.mjs` then `node .tools/wxshell.mjs` (radar.js/mapgl.js/mapleaf.js are in Weather's
  SHELL); `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public` and `node .tools/signin.mjs
  ../inflite/today/public` must print no change (menu.js and signin untouched).
- `suite.txt`: add `roofkit`, `roofwxmount`, `roofshell`, `roofweather`, `roofnav`, `roofsw` after `todaymoments`.
- READMEs: IFL `README.md` (the framework, `ROOF_OFF`, `/weather/` rule), MAIN `.tools/tests` README if it lists tests;
  scratch `roof/golive.md` (§11).
- Done when: no `weather/roof/*.js` still exports `STUB`; unit suite fully green **twice** [RB4]: with IFL `claude/one-roof` beside (0 fail, 0 skipped) and with IFL
  `claude/inflite` beside (0 fail; roof cases skipped with their reason); dry runs ok; full e2e suite twice through
  `e2e.sh` (two slots) with every test FAILS 0 (known flaky `ridetime` re-run once); WebKit smoke of `roofweather` and
  `roofnav` if WebKit can be installed (§10.4); then §11.

---

## 10. Tests

### 10.1 New unit tests (MAIN `.tools/tests/unit/`)

| Test | Batch | Proves |
|---|---|---|
| `roofrouter.test.mjs` | B0 | §3.3 parse/format/owns, tab arg |
| `roofcontract.test.mjs` | B0 | §5.1 exports and rules, BUILD/NEWS equality, sections equality, files ⊇ static graph, `fw.lazy`, scoping and storage rules |
| `roofpage.test.mjs` | B0 → TD | index.html structure and app.js import rules (the cases moved from todayfiles) |
| `roofui.test.mjs` | FW | builders escape data, no style attributes or inline handlers in `roof/*.js`, ARIA (tablist, dialog labels), header skeleton = `IFL.headerHtml`'s, gzip budget |
| `roofsearch.test.mjs` | FW | providers merge/order/timeouts; no `fetch`, no storage, no history writes |
| `roofserve.test.mjs` | SV | `RETIRE_SW`, `roofPage`, `PAGE_HEADERS` = `_headers` |
| `roofwxcore.test.mjs` | WX | parity with `weather/app.js` (§9.4 WX) |
| `roofwxviews.test.mjs` | WV | view helpers, warnings slot, credits parity |
| `roofwxsettings.test.mjs` | WS | settings shapes, untouched keys |

### 10.2 New end-to-end tests (MAIN `.tools/tests/`)

| Test | Stack | Proves |
|---|---|---|
| `roofkit.mjs` | none (kit page) | framework components in isolation (§9.4 FW) |
| `roofwxmount.mjs` | none (kit page + Weather from disk) | the Weather module mounted in the kit (§9.4 WX) |
| `roofshell.mjs` | stub stack (no hub) | Today/Apps/You on the framework; degraded; slow hub; error state (§9.4 TD) |
| `roofweather.mjs` | `// needs: hub` | 1 open Weather from the tile and from the card: one page (alive marker, one main-frame navigation), zoom (clone at once, then the module's hero) or push, header (crumb, place ▾, line, compactTitle, Weather Settings act, warnings badge), switcher; 2 sections and URLs by replaceState, Back to Apps/Today with scroll; Apps tab from inside Weather; 3 cold deep links `/weather/#day=<date>`, `#radar`, `#warnings`, `#settings=units`, `?lat&lon&name` (known place switches; new place → confirm sheet; query and sheet keys gone from URL after show), the card's warning chip → that place's Warnings; 4 places sheet (one-tap rows, switch, find a place via stand-in geocoding, delete, My Location with a granted fake geolocation); 5 Send from Now → engine stand-in via `IFL.hub.send`, toast; 6 Weather Settings pages save and sync (`PUT /api/weather/me` seen in hostpass, `glass` kept), Notifications row → You's Weather Notifications; 7 module files from weather host, minified, no cookie; `IFL.built("weather")` note once; 8 budget (§7.3) for the first open and a cold deep link; 9 storage: only `wx:*`-family keys added; no `today:*` change; search typing leaves nothing; 10 a 401 at `/api/weather/me` with the session alive → no sign-out; a signed-out session → way in; 11 a new build at `/weather/version` mid-session: no reload while in use, no lazy file fetched (Radar tapped → reload at `/weather/#radar`), reload after ≥ 60 s hidden with URL and scroll kept, "Weather updated" once [RB2]; 12 warnings on Now (slot, banner) and the official-`null` empty state; credits sheet; 13 CSP clean, axe, 390 light/dark, 1280 layout |
| `roofnav.mjs` | `// needs: hub` | notification tap with the framework open → in-page (`{ifl:"route"}`), sheets closed first; with Chats open → Chats navigates as now; no window → opens framework at `/weather/?lat…`; round trips: Weather → tab Chats → Back returns `/weather/#radar` with its scroll (`ifl-roof-y`), warm tap→paint ≤ 1.2 s; Apps → Markets → its Back → `/#apps`; Fitness from a Today row → its Back → Today; Mail host `{ifl:"back"}` → `/#apps`; hub pages' tab bar → framework; tab bar pixels equal between framework Today and `/chats/` at 390 light and dark [UI2]; browser back with a sheet open; roof turned off mid-session (the client side, stood in with `context.route`: `/api/hub` → `roof:false`, `/weather/roof/*` → 404, the `/weather/` document → a stand-in "MILESTONE 1 WEATHER" page): on next visible (hidden ≥ 5 min, clock advanced) the page learns it, a shown Weather bounces once to the hub page, a stale page's module import fails into the error state [RB6b]; the Worker's own 404 is `hubworker`'s, and the `ROOF_OFF` page itself is `wxhub`'s |
| `roofsw.mjs` | `// needs: hub` | a stand-in for Weather's old worker (served for the first `register("/weather/sw.js", { scope: "/weather/", updateViaCache: "none" })` through `context.route`: skipWaiting, claim, a `wx-1.64` cache, `/weather/` navigations answered cache-first with an "OLD WEATHER" page, as `weather/sw.js` does; MAIN's real `weather/sw.js` can't install here because its SUMS check fails against the framework page). (a) opening `/` (signed out too) unregisters it and `/weather/` then shows the framework; (b) in a fresh context with the stand-in registered and the route removed, `/weather/` shows the old page once, the update check installs the hub's retiring script, the page is navigated to the framework within 10 s and `wx-*` caches are gone; **offline [RB1]**: after one online open, a **fresh context** with empty sessionStorage, standalone emulated, `setOffline(true)`, open `/weather/#days` → framework from the kept session + module from cache, forecast from `wx:<cell>`, Radar says it needs a connection, and no navigation to weather.inflite.ai ever started; Today offline as before |

### 10.3 Existing tests

Must change (and why):
- `todayworker.test.mjs` (SV): `/weather/` document reaches assets by design (D7), under `roofSkip`'s opposite.
- `hubworker.test.mjs`, `hubheaders.test.mjs` (SV): new rule, roof-off 404 and `/api/hub` `roof`.
- `todayfiles.test.mjs` (SV): CSP now names Weather's origins exactly (D16 reviewable widening); `today-app-3`;
  `/roof/*`; minus the two cases B0 moved to `roofpage`.
- `todaysw.test.mjs`, `rootsw.test.mjs` (SV): new navigation mapping, keep message, `{ifl:"route"}`.
- `hubserve.mjs` (SV): `/weather/` is the framework page, not "a page of the hub with marker /weather/".
- `wxhub.mjs` (SV, first line only): runs with `roof-off`, so it now proves the rollback path is milestone 1 exactly.
- `todayshell.mjs`, `todaypage.mjs`, `todayphases.mjs`, `mocks/todaystub.mjs`, `todaydaypage.test.mjs` (TD): header/
  toast selectors; Radar opens in-page; `/api/hub` answers `roof`; the chip href.
- `hubpush.mjs`, `todaymoments.mjs`, `hubshare.mjs` (Q): only assertions that name Weather's old page DOM; step 4 of
  hubpush (opens `/weather/` as "a hub page") and todaymoments' "Radar in the window" (URL + one page) are expected to
  pass unchanged.
- `wxradar.test.mjs` (WX): new options.

Must stay green unchanged: every other unit test; e2e `wxapp`, `wxacct`, `wxshare`, `wxsay`, `wxtest`, `updates`,
`mkthub`, `chats`, `ridetime`, `hubmail`, `todayauth`, `todaycards`, `todaymorning`, `todaysnap`, `todayrules`,
`sharecard`, `fitness`, `markets`, `sitepaths`, `iflmenu`/`iflhub`/`todaykept`/`mailhost`/`mailframe` unit tests.

### 10.4 Browsers [RI12]

The test kit launches Chromium (`/opt/pw-browsers` has Chromium only; downloads are off by default here). Touch,
mobile viewport and standalone are emulated in Chromium (`roofwxmount`, `roofsw`). I tries
`PLAYWRIGHT_BROWSERS_PATH=<scratch>/pw npx playwright install webkit`; if it installs and launches, it runs
`BROWSER=webkit` `roofweather` and `roofnav` once as a smoke (view transitions, `<dialog>` + `inert`, modulepreload) and
records the result in `golive.md`; if not, it records that. The real-phone checks are listed in `golive.md` for George.

---

## 11. Go-live and rollback

### 11.1 Going live (George asked: "Build it and push")

1. I's checks all green (§9.4 I), including the unit suite with IFL `claude/inflite` beside (what main's CI will see
   between steps 2 and 4: roof cases skip, nothing fails) [RB4].
2. **MAIN to `main`** first: module files are inert (the live framework doesn't load them; `/weather/` is still
   milestone 1's page there because the live Worker has no roof rule); Weather 1.65 standalone shows its note; radar
   changes are backward compatible. Check: main's CI green; `weather.inflite.ai/version` = 1.65; `inflite.ai/weather/`
   (milestone-1 page) still works; `inflite.ai/weather/roof/weather.js` 200 through the hub.
3. **Staging**: `hub-stage.yml` with `inflite_ref = claude/one-roof` → next.inflite.ai; smoke: `/api/hub` `{ready:true,
   roof:true}`; `/`, `/weather/#radar` load the framework; Weather opens, Radar pans on a touch-emulated context, Back
   works; a Chats round trip; `roof.yml state=off where=next.inflite.ai` then `state=on` (proves the switch and the
   settled check on the staging Worker).
4. **IFL to its live branches** (`claude/inflite` and `dist7t`, as every release): Today 1.10 with the roof rule. No
   secret exists → roof on. Check: `inflite.ai/api/hub` → `roof: true`; `/weather/` → framework (`X-Robots-Tag: noindex`,
   CSP with Weather's origins); `/weather/sw.js` → retiring script; `/version` → 1.10; **the `inflite` Worker's newest
   version is the deployed one** (so rollback level 1 can work) [RB6a].
5. **No other IFL branch is pushed** until stage 1 has been live a day without a rollback (a branch push can upload a
   non-production version and block secret changes), unless non-production branch builds are confirmed off for the
   `inflite` Worker (Workers & Pages → inflite → Settings → Builds).
6. Phone checks for George (in `golive.md`; not a gate, see §13 Replies RI12): Today → Weather → Radar (pan, pinch, tap)
   → Back; a Weather notification tap; Home Screen offline Weather; Appearance Dark on a light phone (radar map dark).

### 11.2 Rollback, by level

1. **Weather back to milestone 1 (seconds, no build):** `roof.yml state=off` → `ROOF_OFF=1` on inflite and
   inflite-next, after the settled check. `/weather/` is the hub's Weather page again (its own worker re-registers on its
   first open); `/weather/roof/*` 404s, so even a page that missed the change can't start the module (it shows the error
   state with "Open Weather on Its Own"); open pages learn `roof:false` the next time they become visible (≤ 5 min
   between asks) and a shown Weather bounces once (D14). Data is shared (`wx:*`, same shapes). Undo: `state=on`. If the
   settled check refuses (a newer, undeployed version exists), use level 2.
2. **Today back to 1.09 (minutes):** revert the stage-1 merge on IFL `claude/inflite` and `dist7t` and push (Workers
   Builds redeploys); the 1.09 worker replaces `today-app-3` with `today-app-2`; `roof-weather-*` caches are left
   (code only, harmless). MAIN needs no rollback (module files inert, Weather 1.65 standalone fine).
3. **Everything off:** `hub-off.yml` (milestone 1's switch): degraded Today, apps at their own addresses.

---

## 12. Risks and open questions

### 12.1 Risks (and the guard)

1. Live Today's header/tab bar/sheets rewritten → regressions on the most used page. Guard: todayshell/todaypage/
   todayphases kept green, roofshell, staging first, rollback level 2.
2. MAIN/IFL skew (two deploys, one page). Guard: CONTRACT check, MAIN first (inert), D21 stale handling, error state with
   Weather's own address, roof-off 404.
3. Weather's old `/weather/` worker serving its old page. Guard: unregister in `start()` for everyone + retiring worker +
   roofsw.
4. Port drift between `weather/app.js` and `weather/roof/core.js`/`sync.js` (both write the account record). Guard:
   roofwxcore parity test; `saveSettings` from the whole stored object; server 409 versioning; stage 2 removes the
   duplicate.
5. CSP widened at inflite.ai to Weather's third parties. Guard: exact list, test-pinned to `_wxapp.js`.
6. Leaks and memory in a never-reloading page (radar, charts, maplibre's WebGL context beside Chat's engine frame).
   Guard: kept-alive module, radar map destroyed after 5 minutes out of sight, `destroy()` on sign-out, hide/pause.
7. View Transitions vary across iOS versions. Guard: synchronous update callbacks, CSS fallback, reduced-motion path,
   skip on UA transitions; WebKit smoke where installable; phone checks.
8. Today regressions for degraded users (hub off). Guard: roofshell degraded and slow-hub cases.
9. **Accepted: Weather's code runs inside Today's own document** [RI17]. Origin-level access (storage, Chat's
   IndexedDB) isn't new (Weather's hub page already ran at inflite.ai); what is new is a shared DOM and heap (Today's
   people waiting and Markets figures are readable by module code). Guard: the module's code is MAIN's own, reviewed as
   such; `roofcontract`'s greps (§5.1: no `IFL`, no document-wide queries, no `today:` reads, no `indexedDB`, no
   `parent.`); stage 2 decides whether third-party modules ever exist (they don't in this plan).
10. A rollback refused by Cloudflare because of an undeployed newer version. Guard: `worker_settled` check, golive step
    5, level 2.

### 12.2 For George (defaults in brackets; the build proceeds on the default)

1. InFlite's own accent: indigo from the demo, or today's blue? [indigo, for the header, buttons and switcher; the tab
   bar stays blue until Chats is under the roof]
2. Signed out at `/weather/` shows InFlite's way in (Weather used to work signed out at the hub). OK? [yes]
3. Weather under the roof keeps its sky only in the Now hero (same as Today's card), not the whole page. OK? [yes]
4. No swiping between places or sections in stage 1: switching between two places is the title ▾ then a tap (two taps,
   was one swipe); the places list opens with yours as one-tap rows. OK? [yes]
5. Search is on this phone only and covers Today, Apps, You and Weather: no worldwide places or chat messages, and not
   yet Chats, Fitness, Markets or Mail. OK? [yes]
6. Go live straight after staging and checks, or wait for your phone check first? [straight after; rollback level 1 is
   seconds]
7. Keep separate version numbers per app for now (house rule), not one InFlite release? [keep]
8. Your photo keeps opening InFlite's menu (as in every app) rather than going straight to You, until stage 3. OK? [yes]

---

## 13. Replies

Points where this revision answers a critique differently from its suggestion, with the reason.

- **UB3 (Weather's notification settings).** The critique proposed a Notifications page in Weather Settings over
  `/api/notify`. Agreed on the problem and on the endpoint; placed instead in **You** (a Weather Notifications sheet,
  §4.3), because notifications are one of the framework's shared services in the agreed three layers ("notifications,
  settings in You"), You already writes `/api/notify` for Weather's rain, and a module calling Today's own API would
  blur the connector line. Weather Settings, the connector sheet and search all lead there, so there is no circle and
  every setting standalone Weather offers (per-place Rain/Warnings, briefing place and time, email) is reachable.
- **UI13 (reload only at a boundary).** Adopted, with one exception: when a stale module is about to import a lazy file
  (D21), the page reloads at that moment, at the route being opened, because mixing two builds' files is the failure
  Weather's `SUMS` exists to prevent (RB2). To the user it looks like the section loading.
- **RI12 (a WebKit run and the phone check as gates).** The environment has Chromium only and browser downloads are off
  (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, `/opt/pw-browsers`), so a WebKit gate could block the release on tooling
  rather than on the code; I tries to install WebKit and runs the smoke if it can (§10.4). George asked to "build it and
  push", Q6's default is "straight after", and rollback level 1 takes seconds with the settled check now guarding it,
  so the phone checks are listed for George rather than made a gate. Touch, mobile and standalone behaviour is emulated
  in Chromium in `roofwxmount` and `roofsw`.
- **RI5 (a frozen `REGISTRY.weather.preload` list).** Not added: it would be a second copy of `connector.files` in the
  frozen router, which every batch adding an import would need to change. Instead the framework fetches the tiny
  `connector.js` and preloads its `files` (one extra round trip, in parallel with `/api/session`), and Today's own
  `roof/*.js` are modulepreloaded in `index.html`. Today's time to first card is logged against todayshell's, not gated
  (timings on the shared test machine are too noisy for a hard gate).
- **RB7 (budget).** Chose the lazy route for `rainmap.js`/`radarrain.js` (the radar-rain blend of the next hour waits for
  them, as standalone's does for radar frames), keeping the 90 KB JS budget; the request budget is tied to the measured
  graph (`files.length + 2`) rather than a fixed 30.
- **RI16 (header copy).** Took the critique's first option: the header row is built from `IFL.header()` itself; the test
  pinning it to `IFL.headerHtml()` is kept as a second guard.
- **RB5a (todayfiles).** Took the split, done once by B0 (serial) so neither SV nor TD ever edits the other's file.
- **RB5c (openers).** Took the exported openers; `ctx.open` stays as their bound form so views don't import each other.
- **UB4, UB5, UB6, UB1, UB2, UI1–UI12, UI14, RB1–RB4, RB6, RI1–RI4, RI6–RI11, RI13–RI15, RI17–RI20:** adopted as the
  critiques suggest, at the sections marked.
