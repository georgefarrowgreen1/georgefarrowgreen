# Map: Today's page and the hub, as they are (One roof, stage 1 input)

Read-only map of IFL `/home/user/up4/tf/inflite` (branch `claude/one-roof`, HEAD `bbd3cf3`) and the parts of MAIN
`/home/user/up4/tf/georgefarrowgreen` (branch `claude/one-roof`, HEAD `ce3e311`) that Today and the hub depend on.
Live state (addendum A4–A6): Today 1.09 (`BUILD` at `today/public/app.js:11`), hub ON at inflite.ai (`/api/hub`
ready), `HUB_PUSH=1` (fan-out of every app's notifications to the root subscription is available from You).

Line numbers are for the files as they are now. `app.js` lines 15–777 are the copied InFlite block; the same code is in
MAIN `.tools/inflite/menu.js` at **app.js line − 15** (e.g. `const hub = {` app.js:498 = menu.js:483). The copy differs
from the template only in `APPS` (Today adds `["today","Today"]`) and the inlined `ICONS` (iflmenu.mjs `jsBlock(own)`).

---

## 1. Who answers what at inflite.ai

| Address | Answered by | Notes |
|---|---|---|
| `/`, `/index.html`, `/app.js`, `/day.js`, ... (anything not listed below) | Cloudflare assets (`today/public`) | `wrangler.toml [assets]`, `not_found_handling = "404-page"` → `404.html` ("Today is all on one page"). Headers from `today/public/_headers`. |
| `/api/*` (Today's) | `today/src/index.js` `api()` (l.82) → account.inflite.ai `/api/account/today/*` | `ROUTES` table l.14–40; checks l.87–93 (Sec-Fetch-Site, `X-Inflite: 1`, Origin); query allow-list `QUERY` l.43; 64 KB body cap; `view` routes get `accountOrigin` added (l.127); Set-Cookie passed back only on `cookies:true` routes (session, handback, logout). |
| `/version` | `index.js` `version()` l.159 | Reads `const BUILD = "x.yy"` from the deployed `/app.js` (`appBuild` l.147, cached per `CF_VERSION_METADATA.id`). Feeds `IFL.updates`. |
| `/chats/*`, `/weather/*`, `/fitness/*`, `/markets/*`, `/api/pigeon|weather|fitness|markets/*`, `/api/hub` | `today/src/hub.js` `hub()` l.90 | `isHubPath` l.54, checked first in `index.js:68`. |
| `/mail`, `/mail/`, `/mail/host.css` | `today/src/mailhost.js` `mailPage()` l.114 | Host page built in the Worker (never assets); frames `email.inflite.ai`. |

`wrangler.toml` `run_worker_first` lists exactly `/api/*`, `/version` and the five hub/mail prefixes. Anything new the
framework wants served by the Worker before assets (e.g. making `/weather/` answer Today's shell) must be added there
**and** in `hub.js` `PAGE_RE`/`PAGES`.

`today/src/account.js`: `accountCookie()` (only the `account=`/`__Secure-account=` cookie leaves), `forwardHeaders()`
(Origin = Today's origin, UA, X-Home-Screen, CF-Connecting-IP), `ask()` (timeout → null), `todayOrigin()` (`TODAY_AS`
for the staging hub at next.inflite.ai), `setCookies()`.

Env (`wrangler.toml [vars]`): `ACCOUNT_ORIGIN`, `CHAT_ORIGIN`, `WEATHER_ORIGIN`, `FITNESS_ORIGIN`,
`MARKETS_ORIGIN` (= finance.), `MAIL_ORIGIN`, `AUTH_ORIGIN`; secret `HUB_KEY`; `<APP>_VIA` only in tests. `[env.next]`
= staging hub `inflite-next` at next.inflite.ai with `TODAY_AS=https://inflite.ai`.

## 2. The hub Worker (`today/src/hub.js`)

- Tables (l.19–26): `PAGES` (`/chats/`→CHAT under `/_hub/`, `/weather/`, `/fitness/`, `/markets/`), `APIS`
  (`/api/pigeon/`…), `CAPS` (body caps: Chat 9 MB, Fitness ~25 MB, Weather/Markets 64 KB), `NEVER` (scheduler/hook
  routes refused).
- Readiness (addendum A1): `keyed()`, `probe()` (GET Chat host `/_hub/version` with hub headers; 200 = ok, 404 =
  refused), `known()`, `ready()`; cached 5 min (ok) / 1 min (no) per isolate (l.62–88). `GET /api/hub` → `{ready}` (l.93).
  Without `HUB_KEY` every hub path is 503 (l.94); with a fresh "refused" also 503 (l.98).
- API branch (l.105–120): same Sec-Fetch-Site/Origin rules as Today's api(); `plainPath()` (l.260) normalises before
  the NEVER/climb-out check; then `forward(..., api:true)`.
- Page branch (l.123–132): GET/HEAD only; `/weather` → 301 `/weather/`; an `/api` disguised in a page path refused;
  `/weather/x` → weather host `/x`, `/chats/x` → chat host `/_hub/x`.
- `forward()` (l.138): `hubHeaders()` (l.222: Origin = the app's own origin, `Sec-Fetch-Site: same-origin`, PASS
  headers, `X-Hub-Key`, `X-Hub-IP` from CF-Connecting-IP, `X-Hub-Geo` = base64url of `request.cf` geo); only API
  requests carry the account cookie (and Chat's `Authorization` bearer to Chat only) and a body (capped, `upTo()`).
- `answer()` (l.173): strips Set-Cookie except API `account=`; strips Cloudflare beacon from CSP and HTML
  (`noBeacon`, HTMLRewriter); adds nosniff; drops `Service-Worker-Allowed` and `Clear-Site-Data`; `X-Robots-Tag:
  noindex` on pages; rewrites `Location` via `hubPath()`; HTML gets `Cache-Control: no-cache, private`, no ETag/length;
  injects `<meta name="ifl-hub" content="/weather/">` first in `<head>`, replaces manifest → `/manifest.webmanifest`,
  touch icon → `/icon-180.png`. **The app's own CSP and Permissions-Policy pass through untouched** (Weather's
  `functions/_wxapp.js` `WX_SECURITY`).
- `hubPath(href, env, {from, here})` (l.202): server twin of `IFL.hub.go` (app host → hub prefix; app API path kept;
  email. → `/mail/`).
- MAIN side: `functions/_middleware.js` `hubRequest()` (l.171) verifies `X-Hub-Key` in constant time, then trusts
  `X-Hub-IP`/`X-Hub-Geo` and sets `X-Hub-Ok`; `/_hub/` (Chat's hub copy, `/pigeon/` rewritten to `/chats/`, framed
  only by same-origin: `HUB_SECURITY` in `functions/_app.js:33`) is 404 without it (l.51–53, 107–115).

## 3. Mail at `/mail/`

- Server `today/src/mailhost.js`: `hostPage(mail, auth)` (l.47: bar with Back to Apps, title, "Open Mail on Its Own",
  `<iframe name="ifl-mail">`), `HOST_CSS` (l.85, its own `--mh-*` colours, `@view-transition`), `pageHeaders()` (CSP
  `frame-src <mail>`), 503 if origins unset.
- Client `today/public/mailhost.js`: frame src = Mail + `#signin=<code>` from the host's hash (`codeFrom`,
  `frameSrc`); postMessage protocol from Mail's origin only (`heard()`): `{ifl:"hello",v:1}`, `{ifl:"back"}` →
  `/#apps`, `{ifl:"signin",ask}` → whole window to `auth./#signin=mail&ask=…&back=/mail/`. Also listens to the root
  SW's `{ifl:"open"}` (unless `sessionStorage["ifl-hub-ready"]==="0"`), writes `ifl-crumb`, recounts the badge,
  catches view-transition promises.
- Shown only to the admin: `apps.js` TILES `only: view.apps.mail === true` (l.45).

## 4. Today's page (`today/public/index.html` + `app.js`)

### 4.1 Document
- `<meta name="ifl-hub" content="/">` (l.5) — this is what turns `IFL.hub.on` true on Today's own page.
- Head scripts in order: `fade.js` (catches `document.activeViewTransition` rejections + one unhandledrejection,
  l.8–18), `theme.js` (applies `localStorage["today:appearance"]`, sets `html.boot` for ≤4 s), `app.css`, `day.css`,
  `app.js` (module).
- Body: `#out` (signed-out "way in", shared `.ifl-in` block, links to apps' own addresses, `#signin`, `#join`,
  `#signinToday`); `#in` → `#hd` (header), `#views` → `main#today` (`#kept`, `#top`, `#waiting`, `#coming`, `#rest`),
  `main#apps`, `main#you`; `nav#tabs.ifl-tabs`. Static sheets: `#morning`, `#sh-every`, `#sh-edit` (`.bsheet`).
- CSP (`_headers` `/*`): `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
  connect-src 'self'; frame-src 'self'; worker-src 'self'; ... frame-ancestors 'none'`; `Permissions-Policy:
  camera=(), microphone=(), geolocation=()`; `X-Frame-Options: DENY`. No inline styles anywhere (todayfiles.test).

### 4.2 `app.js` after the shared block (l.778–1830), by section

| Lines | What | Key names |
|---|---|---|
| 778–787 | helpers, `DEFAULT_LINKS` (apps' own origins, or `<app>.<host>` locally) | `$`, `$$`, `standalone()` |
| 790–809 | page state | `S = { view, links, prefs, answer, answerAt, skew, kept, morning, device, endpoint, loadedAt, hub, tab, dayLine, asked5, boundary }`, `sheetOpen`, `waitingAnswer` |
| 812–834 | request helper to Today's own API | `call(path,{method,body})` (X-Inflite on writes, X-Home-Screen, 401 → `signedOutNow()`), `missing(e)` (404/501 = older account side) |
| 841–861 | hub readiness | `hubReady()` (GET `/api/hub`, ≤1.5 s, kept in `sessionStorage["ifl-hub-ready"]`), `ownLinks()`, `hubSays(ready)` → `IFL.hub.degrade(...)` if not ready, toggles `#alsoRow`, sets `#signin` href |
| 867–956 | offline copy per account + app copies at this origin | `KEPT="today:session"`, `CARDS_KEY(id)="today:cards:<id>"`, `keepSession`, `keptOf` (drops Markets card, nulls Chat pigeon places, morning settings only: privacy rule 6), `keepCards`, `forgetKept`, `APP_KEPT` (l.906: markets:*, wx:acct, fitness:*, inflight-*), `inStore()`, `forgetApps()` (Fitness IDB `fitness/files`, Chat IDB `inflight/kv` session/cache/pins), `keptFor` |
| 965–987 | Today's own sign-in trip | `VERIFIER_KEY="inflite:signin-verifier"`, `goToAccount(join)` (PKCE-like: verifier in sessionStorage, `auth./#signin=today&ask=<sha256>&back=<origin>/`), `finishSignIn()` (`#signin=<code>` → POST `/api/auth/handback`) |
| 992–1012 | sign out of InFlite | `signOut()`: DELETE `/api/device` (fallback `/api/push`), unsubscribe, engine `signOut()` (4 s race), POST `/api/logout`, `forgetKept()`, `forgetApps()`, → `auth./#signout=today&back=` |
| 1015–1066 | the two states | `lift()`, `showOut(said)`, `signedOutNow()`, `signedIn(view,{offline})` (sets links, degrade if !hub, prefs, keeps session, `appearance()`, `route({quiet})`, draws kept copy, idle-creates Chat engine) |
| 1070–1088 | cards answer | `gotCards(answer)` (skew, keep, draw, line, morning, Apps redraw, planning → refresh in 5 s, `nextMinute()`) |
| 1093–1131 | views and routing | `VIEWS=["today","apps","you"]`, `TITLES`, `tabOf()` (hash), `route()` (show view, `IFL.hub.tabs($("#tabs"), S.tab)`, `drawHeader()`, lazy Apps/You), `onTab(e)` (pushState for in-page tabs; Chats left as a link), `drawAppsNow()` / `drawYouNow()` (dynamic `import("/apps.js")`, `import("/you.js")`), `appsCtx()`, `youCtx()` |
| 1134–1211 | header and menu | `photoHtml(u)` (`/api/avatar?id&v`), `lineHtml()`, `drawHeader()` (l.1147: `IFL.headerHtml({ me, title: TITLES[S.tab], line, acts:[Edit on Today] })`, `IFL.watch()`), `drawLine()`, `openMenu(anchor)` (`IFL.menu` with rows Notifications → You, Morning, Edit Today), `go(k)`, `accountHref()`, `openAccount(open)` (Home Screen: `/api/account-link` one-minute handoff code), `wireLinks()` |
| 1216–1353 | the day | `nowish()`, `ctx()`, `cleanPrefs()`, `drawCards()` (v2 & fresh → `drawDayNow()` via `import("/day.js")`; else `drawFour()`), `letDayGo()`, `drawFour()` (cards.js `cardHTML` in `#rest`, FLIP animation), `dayCtx()` (l.1278), `drawKept()`, `nextMinute()`/`minute()` (page owns the clock; day.js `timers:false`), `refresh(only)` (`/api/today?v=2&with=morning&device=`), `back()` (visibility → refresh + engine `refresh()`) |
| 1356–1399 | Edit Today | `drawEdit()`, `openEdit()`, `prefsChanged()`, `sendPrefs()` (PUT `/api/prefs`, debounced 400 ms, serialised) |
| 1402–1442 | sheets and toast (page-local) | `openSheet(id)` (creates `.dimmer`, sets `#in.inert`, focus trap), `closeSheet()`, `toast(text)` (`.toast`) |
| 1445–1496 | morning notification sheet | `LINES`, `canPush()`, `pushWhy()`, `drawMorning()`, `putMorning(patch)` (PUT `/api/morning`) |
| 1503–1609 | push subscription (root SW) | `swReg()`, `currentSub()`, `findDevice()` (device id = first 16 of b64url sha256(endpoint)), `postDevice(sub, extra)` (POST `/api/device`, fallbacks `/api/push/move`, `/api/push`), `subscribe()` (permission → `/api/push/key` → `pushManager.subscribe`), `kept(sub)` (`today:push`), `turnOn()`, `turnOff()`, `fanOut()` (`{fan:true}`), `deviceMoved()`, `toMorning()` |
| 1612–1618 | appearance | `appearance(a)` → `today:appearance`, `data-theme`, theme-color metas |
| 1621–1712 | wiring | `wire()` (sign-in buttons, `#tabs` click → `onTab`, Try Again, account links on Home Screen, morning, Edit; `hashchange` → `#signin=` reload else `route()` + `fromHash()`; `popstate` → `route()`), `fromHash()` (`#notify` → `IFL.allow`, `#morning`) |
| 1718–1738 | root SW messages | `worker()`: registers `/sw.js` scope `/`; `{ifl:"signedout"}`, `{inflight:"sync"}` (engine refresh + day refresh 1.5 s), legacy `{open}` |
| 1741–1811 | opening | `hubAsked = hubReady()`, `goFromHash()` (`#go=<path>` from the SW when hub was down), `load()` (finish sign-in, `/api/session` and `/api/today` in parallel when a session is likely, offline kept-copy for Home Screen ≤12 h, `hubSays`, `signedIn`, `fromHash`, `deviceMoved`, `IFL.here("today")` scroll restore) |
| 1813–1830 | `start()` | `IFL.built("today",BUILD,NEWS)`, `IFL.updates({app:"today", url:"/version", busy: () => !!sheetOpen, save: scrollY, files:[...]})`, `load()`, `nextMinute()`, visibility/pageshow/online handlers |

### 4.3 Today's modules (already "modules against a ctx")
These are the closest existing thing to the framework's module contract: each takes a root element and a `ctx` of
page services, and never reaches into the page otherwise.

- `cards.js` (517 l.): `CARD_KEYS`, `APP` (names + `/apps/*.svg`), `esc`, `safe`/`safeOrigin` (address rules),
  `hubOf(ctx)` (prefers `globalThis.IFL.hub`), `onHub(ctx)`, `linkOf` → `IFL.hub.go`, `sendButton(card, ctx, opts)`
  (l.140: a `<button data-send>` at the hub, link to `chat./#share=` off it) + one document listener `wireSend()`
  (l.156) calling `sendHub.send(...)`, `cardHTML(key, card, ctx)` (l.186) for weather/chat/fitness/markets, `placeholder`,
  `applyVars` (data-vars → CSS custom properties: no inline styles), `tick(root, now)`.
- `day.js` (670 l.): `drawDay(root, answer, ctx)` (l.473), `tickDay`, `phaseAt`, `dayLine`, `comingAt`, `mergeWaiting`,
  `stopDay`. ctx: `now, hub, links, prefs, call, toast, refresh, line, drawFour, timers` (header comment l.18–34).
  Uses `hub.chat()` for Waiting-for-You words at idle (`listen`/`whenIdle`/`hear`, l.296–340), `hub.go` for
  breadcrumbs on Open/Answer (l.555–559), `sendTo()` (l.586: engine `sendTo`, else `hub.send`), `act()` → `/api/act`,
  `/api/act/undo`. `linkTo()` (l.158) maps hub paths to own addresses when degraded. `ensureCss()` loads `/day.css`.
- `apps.js` (31 l.): `drawApps(root, {answer, view, hub, href, icon})`; `TILES` (weather/fitness/markets/mail with section
  chips: weather `radar`, `warnings`; fitness `today|activities|progress`; markets `today|holdings|news`). Links are
  plain `<a href="/weather/#radar">` → full page load.
- `you.js` (249 l.): `drawYou(root, ctx)`, `forgetYou()`; sections Account, Rules (`/api/rules`), Notifications by App
  (`/api/notify` PATCH per app), This Phone (switch + "Get Every App's Notifications Here" if `ctx.hub &&
  view.hubPush`), Other Devices (`/api/devices`, hub only), Quiet Hours, Chat Settings (→ `/chats/#account`), InFlite
  versions (from `localStorage["ifl-build:<app>"]`), Sign Out. Uses page sheets via `ctx.openSheet("sh-every")`.
- `wxicons.js`: `weatherIcon`, `moonIcon`, `glyph` (a copy of MAIN's Weather icons; todayfiles.test checks byte
  equality).

## 5. The shared InFlite block (`IFL`, app.js l.21–776 = menu.js l.6–761)

| app.js lines | Part | API |
|---|---|---|
| 24 | iOS pinch-zoom refusal | gesture* listeners |
| 25–69 | apps, icons, glyphs | `APPS`, `NAME`, `ICONS` (inlined SVGs → `iconUrl(app)` blob: URLs), `GLYPHS`, `svg()` |
| 80–95 | note (toast with app icon) | `note(app, title, sub)` |
| 99–130 | notification permission sheet | `allow(app, line, turnOn)`, `wantsAllow()` (`#notify`) |
| 133–137 | "X updated" note | `built(app, build, news)` (`localStorage["ifl-build:<app>"]`) |
| 153–264 | the shared updater | `updates(o)`, `check()` (fetch `o.url`), `offer()`, `soon()`, `tell()`, `apply()` (→ `afresh()` → `location.reload()`), `here(app)` (restore position from `sessionStorage["ifl-here:<app>"]`) |
| 268–372 | the menu (from your photo) | `menu(anchor, o)`, `close()`, `redraw(rows)` |
| 377–407 | the header | `headerHtml(o)` / `header(o)`: `{ me, title, pickAttrs (▾ switcher), line, acts:[{icon,label,attrs}] }`; `watch()`/`settle()` (compact on scroll, `--p`) |
| 456–583 | **the hub** | `IFL.hub` (below) |
| 591–663 | Chat's engine | `chat()`, `wrap()`, `show()`, `hide()`, `dropEngine()`; dropped after 10 min hidden |
| 666–682 | breadcrumb on link clicks; root SW `{ifl:"open"}` listener | `crumb()`, `location.assign(d.url)` |
| 687–712 | hub look and view transitions | `html.ifl-hub`, `recount()` badge, `FADES`, `pageswap`/`pagereveal` skip |
| 715–760 | old-icon card, plain toast | `movedCard()`, `toast()` |
| 762–766 | "sent" said after Chats' own sheet | `sessionStorage["ifl-sent"]` |
| 768–775 | export | `api = {...}`; **at the hub, also `window.IFL`** via `Object.defineProperty` (configurable) so the engine frame can call `parent.IFL.hub.sent/closed` and cards/day find it |

### 5.1 `IFL.hub` (app.js l.498–583)
- `on` = marker present (`meta[name=ifl-hub]`, l.463); `base` = its content; `degraded` flag.
- `go(url)` (l.502): app host/own-site URL → hub path (`SUBS`: chat→`/chats/`, weather, fitness, finance→`/markets/`,
  email→`/mail/`); degraded → own address (`ownAt`); writes the breadcrumb if leaving the page.
- `href(app, section)` (l.517): `HUB_APPS[app] + "#section"`.
- `tabs(nav, current)` (l.524): renders `TABS` (l.462: today `/`, chats `/chats/`, apps `/#apps`, you `/#you`) as
  `<a class="ifl-tab" data-tab>`; degraded → own addresses; click writes breadcrumb. Today intercepts clicks for
  today/apps/you (`onTab`); every other page lets them navigate (full load).
- `back()` (l.540): `location.assign(cameFrom || "/#apps")` — never history's back; breadcrumb in
  `sessionStorage["ifl-crumb"]`, read once at page open (`cameFrom`, l.471).
- `chat()` → engine (§7); `send(words, packed, {to})` (l.548): engine sheet, else `/chats/#share=…&card=…&back=`,
  degraded → `chat./#share=`; `sent(say)`, `closed()`.
- `signIn()` (l.563): `/chats/#signin-start&then=<here>`.
- `moved(app, {off})` (l.568): off-hub Home Screen icon → "InFlite is one app now" card once.
- `degrade(links)` (l.575): sets `degraded`, records own origins, drops engine.

## 6. Routing and navigation today (what is a full page load)

| From → To | Mechanism | Reload? |
|---|---|---|
| Today ↔ Apps ↔ You | `onTab`/`go()` → `history.pushState(#apps/#you)`, `route()`; `popstate`/`hashchange` → `route()` | No |
| Any → Chats (`/chats/`) | tab link | Yes (hub page, Chat's own document, own SW at `/chats/`) |
| Apps tile/chip → `/weather/#radar`, `/fitness/#today`, `/markets/#holdings`, `/mail/` | plain links (`apps.js`) | Yes |
| Today card/day row → app | `cards.js linkOf` / `day.js linkTo` → `IFL.hub.go(href)` → `/weather/...` | Yes |
| App page → Back | `IFL.hub.back()` → breadcrumb | Yes |
| App page tab bar → Today/Apps/You | `/`, `/#apps`, `/#you` links | Yes |
| Notification tap | root SW `openIn()` → `postMessage({ifl:"open",url})` → page `location.assign(url)` (same page: Today's own `{open}` legacy path does `replaceState` + `route()`) | Yes, except Today→Today |
| Morning / notify / sign-in returns | `#morning`, `#notify`, `#signin=<code>` (reload), `#go=<path>` | — |

Cross-fades between pages: `@view-transition { navigation: auto }` in menu.css and HOST_CSS; tab bar
`view-transition-name: ifl-tabs`; failure noise handled by `fade.js` + `vt()` (app.js l.703–712). Each app page has its
own header, menu (its copy of IFL), sheets, toasts and updater.

Hash vocabulary in use (must keep working or be mapped): Today `#apps`, `#you`, `#morning`, `#notify`, `#signin=`,
`#go=`; Weather `#radar`, `#warnings`, `?lat=…&lon=…` (from push `url`); Fitness `#today|#activities|#progress`,
`#act`, `#offer`, `#strava=`; Markets `#today|#holdings|#news`, `#s=TSCO`; Chats `#open=<id>`, `#share=…&card=…&back=`,
`#signin-start&then=`, `#account`, `?engine=1`.

## 7. Chat's engine frame

- Made by `IFL.hub.chat()` (app.js l.623): `<dialog class="ifl-engine-box"><iframe name="ifl-chat"
  src="/chats/?engine=1">` appended to body; resolves when the frame dispatches `ifl-chat-ready` on the parent and
  exposes `contentWindow.IFLChat`; 15 s timeout → dropped and "resting" 2 min. Kept while the page is open; dropped after
  10 min hidden (l.657–663).
- Shown only while its send sheet is up (`showModal()` → top layer, over page sheets); hidden but laid out otherwise
  (menu.css `dialog.ifl-engine-box`, app.css l.795–806).
- `IFLChat` (MAIN `pigeon/app.js` `makeIFLChat` l.810, set in `engineReady()` l.12247): `state` ("ready", "signin",
  "key", "locked"), `share(words, packed, {to})`, `sendTo(id, words, packed)` (requires the parent page's user
  activation, `tappedOn` l.803), `waiting({ids, stocks})` (decrypted words for Waiting for You, in memory only),
  `since(id, t)`, `refresh()`, `signOut()`. `engineRule()` (l.792) allows it only framed by a same-origin hub page.
- Users on Today: `signedIn()` idle-creates it (l.1065); `back()` and SW `{inflight:"sync"}` call `refresh()`;
  `signOut()` calls `signOut()`; day.js `hear()`/`sendTo()`; cards.js Send.
- Engine sync is `sync?quiet=1` (Today open is not "seen in Chats").

## 8. Service workers and caching

- **Root SW** `today/public/sw.js`, scope `/`, registered by `worker()` (app.js l.1720). Cache `SHELL="today-app-2"`,
  `FILES` (l.12) = Today's own files only. `fetch` (l.34): only same-origin GET, never `/api/`; **navigations answered
  only for `/` and `/index.html`**, sub-resources only if in `FILES` and without a query; network-first, cache fallback
  on network error or 5xx (`fresh()`). `install` → `skipWaiting`, best-effort cache (8 s cap); `activate` → delete old
  `today-app-*`, `clients.claim()`. `message`: `{ifl:"renew"}` → `{ifl:"renewed"}`; `{ifl:"badge"}` → `badge()`.
- **App SWs** at their own scopes on the same origin, via the hub: `/chats/` (Chat), `/weather/` (Weather's versioned
  all-or-nothing cache `wx-1.64` with SHA-256 `SUMS`, `weather/sw.js`), `/fitness/`, `/markets/`. None hold a push
  subscription at the hub. `answer()` strips `Service-Worker-Allowed`, so no app SW can widen to `/`.
- HTTP caching: `_headers` gives Today's own files `no-cache`; Worker API answers `no-store`; hub HTML `no-cache,
  private` (bfcache-friendly); `/api/avatar` immutable by `?v=`.
- Updates: each page runs `IFL.updates` against its own `version` URL (`/version` for Today, `/weather/version` etc. at
  the hub), reloads the whole document when a new build is ready; `afresh()` asks the controlling SW to renew and
  re-fetches `U.files` with `cache:"reload"`. Today's `files` list (app.js l.1819) must match what its page loads
  (todaysw.test "every file the page loads as it opens is among those it keeps").
- Offline: Today opens from `today-app-2` + the per-account kept copy (`today:session`, `today:cards:<id>`); a Home
  Screen Today with no network draws the kept view if ≤12 h old (app.js l.1793). App pages offline depend on their own
  SWs.

## 9. Sign-in on Today

1. **Session read**: `GET /api/session` → account `today/me`; the account cookie (`account=`, domain-wide on
   inflite.ai) is the only credential; the view carries `user`, `prefs`, `morning`, `links`, `quiet`, `apps` (`mail`
   for admin), `hubPush`, `signedIn`, and Worker-added `accountOrigin`.
2. **Sign in (hub ready)**: `#signin` → `/chats/#signin-start&then=/` — Chat's own trip signs in the account *and*
   restores Chat's key at inflite.ai (MAIN `pigeon/app.js` l.12386), then returns to `then`.
3. **Sign In Without Chats / hub not ready / Make an account**: `goToAccount()` → `auth.inflite.ai/#signin=today&ask=…&back=…`
   → returns `/#signin=<code>` → `finishSignIn()` → `POST /api/auth/handback {code, verifier}` → Set-Cookie through the
   Worker (needed for Home Screen Today, which has its own cookie jar).
4. **Account pages**: `openAccount(open)` leaves the window to `account.inflite.ai/#from=today&open=…`; from a Home
   Screen, `POST /api/account-link` gives a one-minute `handoff` code.
5. **Signed-out detection**: any 401 in `call()` → `signedOutNow()`; SW `{ifl:"signedout"}`.
6. **Sign out**: `signOut()` (§4.2) — device rows removed, engine signs Chat out, cookie cleared, kept copies and every
   app's copies at this origin forgotten (`APP_KEPT`, todaykept.test pins it to each app's own sign-out lists).
7. Apps at the hub: their API calls go through `/api/<app>/*` and carry the same cookie (`forward(api:true)`), so a
   Weather/Fitness/Markets page at the hub is signed in by Today's session with no trip of its own; `IFL.hub.signIn()`
   sends a signed-out app page to Chat's trip.

## 10. Notifications

- One subscription per device, on the root SW (spec §11.3). Turned on from a tap only: `turnOn()` (Today's morning:
  `POST /api/device {sub, tz}` → `td_push`) and `fanOut()` (`{fan:true}`: copies the device into Chat/Weather/Markets
  tables, `via='hub'`; You's "Get Every App's Notifications Here", needs `view.hubPush`). Fitness's go into the morning;
  Mail keeps its own.
- `sw.js` `push` → `notify(d)` (l.83): payload `{app, title, body, tag, url}`; tag namespaced `<app>:<tag>`;
  `openAt(app, url)` (l.129) maps app-own URLs to hub paths (`BASES`, `HOSTS`; Chat `/pigeon/` → `/chats/`; Fitness/
  Markets default `#today`); Chat pushes also `chatCame()` → every window gets `{inflight:"sync"}` and a delivered pulse
  `POST /api/pigeon/pulse` with Chat's IDB token. Badge = count of shown notifications (`badge()`), recounted on page
  open/visible (`recount()` in IFL and mailhost.js).
- `notificationclick` → `openIn(path)` (l.163): focus a window and `told()` it `{ifl:"open", url}` over a
  MessageChannel (1 s for "opened"); else `win.navigate`/`openWindow`; if the hub is down, `/#go=<path>`.
- `pushsubscriptionchange` (l.204): re-subscribe and `POST /api/device {sub, was}` (fallbacks `/api/push/move`,
  `/api/push`).
- Settings live in You (`/api/notify`, quiet hours, devices) and the `#morning` sheet. `IFL.allow()` sheet on `#notify`.
  App pages at the hub don't ask for permission (Weather `ASK_NOTIFY = … && !IFL.hub.on`, app.js l.783 in Weather's copy).

## 11. Degraded mode (addendum A1)

Trigger: `/api/hub` not `{ready:true}` within 1.5 s (or 404/503) → `hubSays(false)` → `IFL.hub.degrade(ownLinks())`.
Effects: `go`/`href`/`tabs` give own addresses (`chat.`, `weather.`, `fitness.`, `finance.`, `email.`); `send` →
`chat./#share=`; no engine (`chat()` resolves null); You hides Every App's/Other Devices (`ctx.hub` false); day.js
`linkTo` maps hub paths to own addresses; Sign in = Today's own trip; root SW `openIn` routes app taps through
`/#go=` and `goFromHash()` forwards to the own address. Today's own content (cards, phases, Coming Up, names) still
works because `/api/*` doesn't need the hub key. **Every `/api/<app>/*` call needs the hub key** (hub.js l.94), so
anything app-native inside Today has no API when degraded.

## 12. Design system as it stands

- Today's tokens: `app.css` l.8–56 (`--sky-*`, `--text*`, `--glass*`, `--tint*`, `--edge`, `--lift`, `--blur`, radii
  `--r-group/--r-hero/--r-card`, fonts, easing; per-app colours `--c-chat #2b6fe6`, `--c-weather #3a86f0`, `--c-fitness
  #f0542e`, `--c-markets #12a46a`, `--c-mail #1aa58f`, `--c-account`, `--c-inflite`). Dark first, light blocks below.
- Shared copied CSS: menu/header/tab bar/settings-sheet/hub/engine (`app.css` l.556–811 from MAIN
  `.tools/inflite/menu.css`; its own `--ifm-*`, `--ifh-*`, `--ifl-tab-*` variables, not Today's tokens) and the way in
  (l.813–931 from `signin.css`).
- Components duplicated: three toast systems (`app.js toast()` `.toast`; `IFL.note()`; `IFL toast()` `.ifl-toast`),
  two sheet systems (Today's `.bsheet` + `openSheet`; `IFL.allow`/`movedCard` `.ifa-layer`; each app has its own),
  Mail host's own `--mh-*` palette. Weather's look lives in `weather/styles.css` (own sky, own glass), not Today's
  tokens.

## 13. Storage at the inflite.ai origin (relevant to privacy rule 6 and to modules sharing the origin)

- localStorage (Today): `today:session`, `today:cards:<id>`, `today:push` (endpoint), `today:appearance`; (IFL)
  `ifl-build:<app>`, `ifl-moved:<app>`; (apps at the hub, same origin) `wx:*`, `markets:*`, `fitness:*`, `inflight-*`.
- sessionStorage: `inflite:signin-verifier`, `ifl-hub-ready`, `ifl-crumb`, `ifl-sent`, `ifl-upd:<app>`,
  `ifl-here:<app>`, Chat's `ifl-chat-wait`.
- IndexedDB: `inflight` (Chat: session, key, cache, pins), `fitness` (files), Weather's own stores.
- Rule 6 as enforced on Today: `keptOf()` strips Markets and Chat places from `today:*`; Waiting-for-You words only in
  memory from the engine; `QUERY` allow-list and "never a push endpoint in a URL" (index.js l.42); Worker logs only
  `e.message`. Because Weather already runs at `/weather/` on this origin, a Weather module at `/` inherits the same
  `wx:*` keys and IndexedDB with no migration.

## 14. Tests that pin these files (MAIN `.tools/tests`)

Unit: `todayworker`, `hubworker`, `hubheaders`, `todaysw`, `rootsw`, `todayfiles` (byte-equal copies, no inline
styles, headers), `todaykept` (APP_KEPT ⊇ each app's sign-out keys), `todaysignin`, `todaydaypage` (day.js/cards.js),
`iflmenu` (copies equal the template), `mailframe`, `mailhost`, `mailsignin`, `chatsonly`, `engine`. End-to-end
(`suite.txt` l.53–76): `todayauth`, `todaycards`, `todaymorning`, `todaysnap`, `todayrules`, `todaypage`,
`todayshell` (tabs, engine, degraded case, You writes), `todayphases`, `hubserve`, `wxhub`, `mkthub`, `hubmail`,
`hubshare`, `hubpush`, `todaymoments`; harness `hubstack.mjs` (Worker in wrangler dev on :8787 as `ifl.test:8788`).

---

## 15. Keep, replace, and the seams

### 15.1 Keep as is (the framework builds on these)
- **The Worker's API proxy** (`index.js` `ROUTES`/`api()`, `account.js`) and **the hub's API branch** (`hub.js`
  `forward(api:true)`, CAPS, NEVER, `plainPath`, cookie/bearer rules). These *are* the connectors' transport: a module
  at `/` calls `/api/weather/*` exactly as Weather at `/weather/` does now (Weather already uses absolute
  `/api/weather/...`: `weather/app.js:938,3151`, `data.js:249,554`).
- **Hub page proxying for the apps not yet modules** (Chats, Fitness, Markets) and Mail's framed host — unchanged in
  stage 1; the framework links to them as today (`IFL.hub.href`, breadcrumb, `back()`).
- **Root SW push/notification half** (`notify`, `openAt`, `openIn`/`told`, `badge`, `chatCame`,
  `pushsubscriptionchange`) and the one-subscription device model (`turnOn`, `fanOut`, `/api/device`).
- **Chat's engine** (`IFL.hub.chat`, `IFLChat`, the dialog/top-layer trick): the framework's Send sheet can stay "the
  engine's sheet" in stage 1.
- **Sign-in flows** (Chat-first trip, Today's handback, account handoff, `signOut()` + `forgetApps()`), the 401 →
  signed-out rule, the per-account kept copy and its privacy filtering.
- **Today's content modules** `day.js`, `cards.js`, `apps.js`, `you.js` and their ctx contracts (they already render
  into a root with injected services: `call`, `toast`, `hub`, `refresh`, `line`, `openSheet`).
- **Updater mechanics** (`IFL.updates`, `/version`), degraded-mode readiness (`/api/hub`, `hubReady`), the address
  safety rules (`ownPath`, `safe`, `safeOrigin`, `plainPath`, `hubPath`).

### 15.2 What the framework would replace (on the framework page)
- **`route()`/`onTab()`/`go()` and hash-only routing** (app.js l.1093–1116, 1184) → a real router owning paths
  (`/`, `/#apps`, `/#you`, `/weather/...`) with in-page history, so Weather (and later the others) open without a load.
- **`IFL.hub.tabs()` as links** → a persistent tab bar that routes in-page for module screens and falls through to
  links for hub pages (Chats/Fitness/Markets/Mail in stage 1).
- **`IFL.hub.back()` breadcrumb (sessionStorage, `location.assign`)** → in-page history stack; the breadcrumb must still be
  written when leaving to a hub page so its Back returns to the right framework screen.
- **`drawHeader()`** (one title per tab, Edit act) → the framework header (Back, app name, title, section switcher).
  `IFL.headerHtml` already supports `pickAttrs` (▾ switcher) and `acts`; it has no Back slot (`.ifl-back` CSS exists in
  menu.css for app pages) and no app-accent hook.
- **Page-local sheets/toasts** (`openSheet`/`closeSheet`/`toast`, `.bsheet`, `.dimmer`, `#in.inert`) → one sheet and
  toast service shared by Today/You/modules (and reconciled with `IFL.note`, `IFL.allow`, engine dialog z-order).
- **Root SW navigation handling**: today only `/` is a cached navigation (`sw.js` l.38). If `/weather/` becomes the
  framework shell, the SW must answer it (and `FILES` must include module files, or a module cache), and `openIn` must
  route in-page rather than `location.assign` (the `{ifl:"open"}` listener at app.js l.675 does a full load).
- **Two updaters on one page**: Weather's `IFL.updates({app:"weather"})` and its own SW reload would fight Today's.
  One updater per document is the rule the current code assumes (`U` is a singleton per IFL copy).

### 15.3 Seams and gotchas for stage 1 (Weather as first module)
1. **CSP / permissions on Today's page** (`_headers`): Weather needs `connect-src` for open-meteo (7 hosts),
   bigdatacloud, nominatim, rainviewer, openfreemap; `img-src` for rainviewer/OSM/openfreemap tiles; possibly
   `'wasm-unsafe-eval'` (only for Weather's own password stretch in `weather/account.js`, unneeded if sign-in is the
   framework's); and **`Permissions-Policy: geolocation=()` blocks Weather's "where you are"** — must become
   `geolocation=(self)` (Weather's `WX_SECURITY`). The hub currently passes Weather's own CSP through at `/weather/`;
   at `/` only `_headers` applies. `todayfiles.test` and `hubheaders.test` pin these headers.
2. **API without the hub key**: `/api/weather/*` is a hub path (503 without `HUB_KEY`, hub.js l.94). In degraded mode the
   module has no API; either keep degraded = "open weather.inflite.ai" (as now), or give Weather's API a non-hub
   route in `index.js` (its own ROUTES-like proxy) — a design decision.
3. **Who serves `/weather/`**: `wrangler.toml run_worker_first` + `hub.js PAGES` currently proxy Weather's page. Stage 1
   needs `/weather/` (and its hashes/query: `#radar`, `?lat=`) to load the framework with the Weather module — either
   assets rewrite to `index.html` or `hub()` returning Today's shell for page paths while still proxying Weather's
   static files (`/weather/app.js`, `/weather/vendor/…`, `/weather/radarwork.js`) for the module to import. Weather's
   ES-module relative imports and `new Worker(new URL("./radarwork.js", import.meta.url))` resolve against the module
   URL, so importing from `/weather/*.js` via the hub works; `register("./sw.js")` (weather/app.js:957) resolves against
   the *document* and must not run inside the framework.
4. **Weather carries its own copy of IFL** (weather/app.js l.18–780: header, menu, tab bar, updater, `window.IFL`
   defineProperty). Loaded as a module into Today's document, two IFL copies would both claim `window.IFL`, both add
   gesture/visibility/SW listeners, both run `IFL.updates` (Weather's at weather/app.js:966, `BUILD "1.64"` at l.3379). The module must not execute that block; the framework's
   IFL must be the only one. This touches iflmenu.mjs (it copies the block into `weather/app.js` by marks) and
   `iflmenu.test`.
5. **Weather's SW and cache**: at `/weather/` scope it controls `/weather/` documents only; a module running in the `/`
   document is controlled by the root SW, which does not cache Weather's files. Offline Weather-in-framework needs the
   root SW (or a module cache) to hold them; Weather's `SUMS`/`wxshell.mjs` integrity scheme is per-version and
   all-or-nothing.
6. **Sections switcher**: Weather's sections (Apps chips: `radar`, `warnings`) map to the header switcher via
   `IFL.headerHtml({pickAttrs})`; the address forms in §6 must keep working from notifications (`openAt`) and old links.
7. **Today's cards open into the app**: `cards.js linkOf`/`day.js linkTo` go through `IFL.hub.go(h)` returning a path;
   the router must intercept those `<a href="/weather/...">` clicks (one document-level click handler, as the
   breadcrumb listener at app.js l.666 already is) instead of changing every card.
8. **Send**: `cards.js wireSend` + `IFL.hub.send` + engine is the one Send path already; Weather's own Send
   (`weather/app.js:2054–2060`, `M.sendWay(..., {hub: IFL.hub})`) already calls `IFL.hub.send` at the hub — it will work
   unchanged if the module sees the framework's `IFL.hub`.
9. **Sign-in inside the module**: Weather's own sign-in (`weather/account.js`, `fetch(\`${API}/...\`)` to the account,
   wasm stretch) must be suppressed; the framework's session (`S.view`) is the truth and `/api/weather/*` already carries
   the cookie.
10. **Versions/NEWS**: Today's `BUILD` drives `/version` (read by regex from `/app.js`); Weather's `BUILD` drives
    `/weather/version`. House rule still requires both to be raised when changed; You shows per-app versions from
    `ifl-build:<app>`. If the Weather module lives in MAIN's `weather/` and is loaded by Today, a Weather release changes
    Today's page without a Today `BUILD` change — the updater won't notice unless the framework also polls
    `/weather/version` (or Today's `/version` composes both).
11. **Shared-block ownership**: `IFL` (menu.js) is MAIN's and copied into Today by `node .tools/iflmenu.mjs
    ../inflite/email/public ../inflite/today/public`; framework navigation either extends menu.js (affects every app copy
    and Mail) or lives in Today-owned files beside it. `iflmenu.test` compares the IFL repo copies.
12. **Minify**: MAIN serves apps minified from `min/` (`functions/_min.js`); a module imported via the hub gets the
    min copy if fresh. Today's files are not minified (no min step in IFL).
13. **Privacy rule 6**: a Weather module may store place names (not a Chat place); it must not write Markets amounts or
    Chat words under `today:*`. Hub/Worker logs only `e.message`.
14. **View transitions**: in-page module switches no longer get `@view-transition` for free; `fade.js`/`vt()` remain for
    the remaining hub page loads. `FADES` (app.js l.703) lists which paths may cross-fade.
15. **Degraded mode** still has to work: framework tab bar and Apps must fall back to own addresses (`ownAt`), and a
    `/weather/` notification tap with the hub down still routes `/#go=` → own address (`sw.js` l.172, app.js l.1745).
