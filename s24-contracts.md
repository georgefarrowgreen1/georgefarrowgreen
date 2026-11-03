# One roof, stages 2–4: the joint contracts (batch j0)

The one reconciled set of names and shapes that stage 2 (Markets, Fitness), stage 4 (Mail) and stage 3 (Chats, built
later) build to. **This file overrides `s2/spec.md` (and `s2/handoff.md`'s `ROOF/s2/contracts.md`) and `s4/spec.md` §5
wherever they differ.** Where the two stages disagreed, the choice and its reason are given (⚖). Everything here is
backward compatible: with no new module switched on, behaviour is stage 1's exactly. Weather's live behaviour is kept.

Written by j0 (the joint B0 = stage 2's B0 + stage 4's B0-a), branch `r24/j0` in both repos, merged into
`claude/one-roof-24`. Items marked **done in j0** are built and tested by j0: stage 2's FW and SV batches (and stage 4's
batches) skip them and build only what's left of their brief.

---

## 1. The switch (server, `today/src/roof.js`) — done in j0

```js
export const MODS = ["weather", "markets", "fitness", "mail"];       // stage 3 adds "chats"
export const roofOn = (env, app = "weather") => env?.ROOF_OFF !== "1" && (app === "weather"
  ? env?.ROOF_OFF_WEATHER !== "1"
  : env?.["ROOF_" + String(app).toUpperCase()] === "1");
export const appsOn = (env) => Object.fromEntries(MODS.map((a) => [a, roofOn(env, a)]));
```
- **Opt-in** for every new module: `ROOF_MARKETS`, `ROOF_FITNESS`, `ROOF_MAIL` (stage 3: `ROOF_CHATS`) must be exactly
  `"1"`; absent, `"0"` or anything else = off. A Worker that loses its secrets falls back to the hub pages, and whichever
  stage deploys first can't switch another stage's module on before its files exist.
- **Weather opt-out** with `ROOF_OFF_WEATHER="1"`. ⚖ s4 had `ROOF_WEATHER="0"`; s2 and the integrator's brief have
  `ROOF_OFF_WEATHER`: a secret whose *presence* with `"1"` means off reads the same way as stage 1's `ROOF_OFF`, and an
  accidentally empty or mistyped `ROOF_WEATHER` can never turn Weather off.
- `ROOF_OFF="1"` still turns **everything** off (stage 1's switch, unchanged).
- `modOf(path)` → the app whose document `path` is (`/^\/(weather|markets|fitness)\/(index\.html)?$/`); `ROOF_DOCS`,
  `ROOF_FILES` kept for Weather (stage 1 names) plus `docOf(app)`/`filesOf(app)` regexes per app; `RETIRE_SW(app)` and
  `retireWorker(request, app = "weather")` with each app's cache prefix (`wx-`, `markets-app-`, `fitness-app-`).
  Mail's `/mail/` is not the hub's: MT's `mailroof.js` uses `roofOn(env, "mail")`.

## 2. `/api/hub` and the page (client) — done in j0
- `GET /api/hub` → `{ ready, roof, apps }`; `roof` = `roofOn(env, "weather")` (kept for 1.10 pages, which read only it);
  `apps` = `appsOn(env)`: `{ weather, markets, fitness, mail }` booleans.
- `sessionStorage["ifl-roof-apps"]` = JSON of app names → booleans only (`{"weather":true,"markets":false,…}`), beside
  `ifl-hub-ready` and `ifl-roof`. A missing or unparsable `apps` means `{ weather: roof }` (a stage-1 Worker).
- `F.session.apps` = `{ [app]: boolean }`, each already ANDed with `hub` (`{}` when the hub is off). `F.session.roof`
  stays (= `apps.weather`).
- The callers that decide pass `roof: F.session.hub ? F.session.apps : false` to `router.parse`/`owns`; the frame's own
  re-parse of an address it already accepted passes `roof: true`.
- `F.setRoof(v, apps)`: `v` = Weather's flag (stage 1's argument, still accepted alone), `apps` the new map. An app that
  turns off is unmounted; if it is the one showing, D14's bounce (`ifl-roof-bounce` marker, one reload) — see §7 for when.
  Apps that stay on are untouched; an app that turns on gets its search provider.
- The page asks `/api/hub` again on `visible` (≤ every 5 min, as stage 1), before `loadModule` (≤ every 30 s), and after a
  module reports its API refused it: `fw.session.hubAgain()` (Mail: a CORS failure while online) → `Promise<void>`.
- `modules.loadModule(app)` refuses unless `F.session.apps[app]` (after the re-ask).
- Boot at a module's path (`/markets/`, `/fitness/`, `/mail/`, `/weather/`): a kept answer is trusted only if it says hub
  yes and that app on (stage 1's Weather rule, per app). With no answer at all (offline, `/api/hub` failing), Weather is
  on as stage 1 had it, and the boot app is on **unless the tab's kept `ifl-roof-apps` says it's off** (the root worker
  serves its kept `/` at `/markets/`, `/fitness/`, `/mail/` when the hub's own page fails, so "served here" no longer
  means "on"; review I-5). `heard()` drops `ifl-roof-bounce` only when the boot app is none
  or on (an off module's path served the framework from the worker's kept `/` must not loop).

## 3. REGISTRY (`today/public/roof/router.js`, ❄) — done in j0
```js
markets: { app: "markets", name: "Markets", path: "/markets/", link: "finance",
  entry: "/markets/roof/markets.js", connector: "/markets/roof/connector.js", css: ["/markets/roof/markets.css"],
  sections: [["today","Today"],["holdings","Holdings"],["news","News"]],
  aliases: { s: "today", income: "holdings", isa: "holdings", vs: "holdings", about: "holdings" } },
fitness: { app: "fitness", name: "Fitness", path: "/fitness/", idb: "fitness",
  entry: "/fitness/roof/fitness.js", connector: "/fitness/roof/connector.js",
  css: ["/fitness/roof/fitness.css", "/fitness/roof/fxviews.css"],
  sections: [["today","Today"],["activities","Activities"],["progress","Progress"]],
  aliases: { plan: "today", day: "today", offer: "today", settings: "today", act: "activities" } },
mail: { app: "mail", name: "Mail", path: "/mail/", link: "email",
  entry: "/mail/roof/mail.js", connector: "/mail/roof/connector.js",
  css: ["/mail/roof/mail.css", "/mail/roof/reader.css", "/mail/roof/mailsheets.css"],
  sections: [["people","People"],["updates","Updates"],["later","Later"],["done","Done"]],
  aliases: { thread: "people", settings: "people", signin: "people" }, stay: ["thread"] },
```
- **`link`** (⚖ s2 `own`, s4 `link`): the `F.session.links` key of the app's own address when it isn't the app's name
  (`links[R.link || app]`). "own" collides with `router.owns()` and with "Open on Its Own"; `link` says what it indexes.
- **`stay`** (⚖ s2 `stay`, s4 `keep`): hash keys the D6 tidy leaves in the address. "keep" already means the root
  worker's `{ ifl: "keep" }`, `keepOffline` and "kept copy" everywhere in this code; `stay` can't be confused with them.
- `idb`: the one IndexedDB name the module may open (C5; Fitness `"fitness"`).
- Route arg (s2 C1): `ARG = /^[\w.^=-]{1,40}$/`, matched after one `decodeURIComponent` (a failure → `null`); split on
  the first `=`; `format` writes the arg raw. **Weather keeps stage 1's rule exactly**: `[\w-]{1,40}` as written, never
  decoded, in `parse` and `format` (review I-9b); You's arg likewise.
- `parse(href, { roof })` / `owns`: `roof` is `false`, `true` (every app) or a map; an app route is ours only if
  `roof === true || roof?.[app] === true`. Stage 1's boolean cases keep passing.

## 4. `fw` additions (module contract stays `CONTRACT = 1`) — done in j0
| Name | Shape | Notes |
|---|---|---|
| `fw.header.set({ sections: false })` | hides the switcher | ⚖ s2 `false`, s4 `null`: `set` *merges*, and `null` elsewhere in it means "none of mine" (`pick: null`); `false` is the one spelling that can only mean "hide". The frame also treats `null` as hide, so Mail's stubs work either way, but code and tests use `false`. Any other value or none shows it. |
| `fw.header.set({ back: { label } })` | Back's words | the action is always `F.nav.back`; label shown as given (e.g. "Back to Mail") |
| `fw.nav.go(path, { replace, kind })` | | `replace: !!o.replace`; `kind` "push" \| "tab" \| "zoom" \| "section" passed to `F.nav.go`; anything else (`"pop"` too) is ignored, a push as usual: a Back is only ever the frame's own (review I-10) |
| `fw.nav.depth()` | → number | `curDepth()`: 0 on a cold screen |
| `fw.changed()` | → void | calls the host's `opts.changed?.()`; Today marks its cards stale and asks again on its next show |
| `fw.session.hubAgain()` | → Promise | the re-ask after a module's API refused it (§2) |
| `fw.toast(…)` / `F.toast(…)` / `toast(…)` | → `{ close() }` | was `void` |
| `instance.flush()` | → `Promise<{ lost: number }>` (optional) | save what's unsaved now |
| `F.flush()` | → `Promise<{ lost: number }>` | every mounted module's `flush()`, each capped at 2 s (a module that doesn't answer counts `lost: 0`) |
| `instance.busy()` | (stage 1) | true while something unsaved would be lost by a reload |
| `fw.search.provide(p)` | | replaces only **this module's** connector provider (§6) |

C7 focus/scroll for a `stay` key change: a push to a `stay` route moves focus to the header's title; a pop returns it
to `backTo`; the pop's saved scroll is re-applied after the module's `show()` resolves **only for a `stay` change**
(every other pop, Weather's included, is scrolled once at once, as stage 1; review I-9a).

## 5. Connectors (`today/public/roof/connectors.js`) — done in j0
- Connector v1 gains optional `lazy: string[]` and `search(q, { userId })` (the second argument is ignored by connectors
  that don't need it). The frame passes `{ userId: F.session.view?.user?.id ?? null }`.
- `connectorOf(app, F)`: a REGISTRY app that is on (`F.session.apps[app]`) → its `connector.js`; off (or the file fails)
  → a per-app fallback with the same `shares` words and its `mini` (STATIC keeps `chats` and `mail`; `fallback(app)`
  holds Weather's, Markets' and Fitness's words and minis, moved from today's STATIC). `STATIC.mail` stays for the
  switch-off case.
- `connectorProvider(F, app) → off`: generalises `placesProvider` (kept as `placesProvider(F) = connectorProvider(F,
  "weather")`); ids/groups: Weather `"places"`/"Places" (order 20), Markets `"markets"`/"Markets" (30), Fitness
  `"fitness"`/"Fitness" (40), Mail `"mail"`/"Mail" (50).
- The Apps search provider lists an app's sections only when `view.apps?.[app] !== false` (Mail: admin only).

## 6. Search providers per module — done in j0
The frame registers `connectorProvider(F, app)` for every REGISTRY app whose flag is on. `fw.search.provide` from a
module replaces only that module's connector provider while mounted; when the module's provider goes, its connector
provider comes back. Places therefore stays while Markets, Fitness or Mail is mounted.

## 7. `fw.lazy`, reloads and the bounce (s2 C7 + s4 C1) — done in j0
- Every stale reload the frame starts itself (the lazy one, the route one, the visible one, the `setRoof` bounce) runs
  only when `!F.busy()` (no sheet open and the shown module's `busy()` false). It checks every second; the route and
  visible reloads otherwise wait for the next route change or `visible`.
- The **bounce** (an app switched off while showing): when nothing is unsaved (`!F.busy()`), at once, as stage 1 did
  (the instance's `flush()` called, the module unmounted, `ifl-roof-bounce` set, one reload at the address). Otherwise
  `F.flush()` first, then the same once it's idle, checked each second; if still busy after 10 s it waits for the next
  `hidden`, flushes again, and bounces then if idle, else polls again (10 s) and waits for the following `hidden`. ⚖ s2
  "gives up after 10 s" is read as "stops polling", never "reloads anyway": s4's rule (never reload over unsaved work)
  wins. One wait at a time: a new one drops the last one's timer and its `hidden` listener (and `destroy()` drops it).
- **Left meanwhile** (review I-2): if the user leaves the off module before the bounce (Back to Today, another module),
  there is no reload and no marker: the off module's own `flush()` is called and it is unmounted once that settles. "Busy"
  for the bounce means *that module shown and `F.busy()`*: another screen's sheet doesn't hold it.
- An app switched off that **isn't shown** is let go of the same way: its `flush()` (where it has one) first, then
  unmounted (unless it was mounted again or shown meanwhile); a module with no `flush()` (stage 1's Weather) at once.
- So **modules save what's unsaved on `hide()` as well as on `flush()`**: after it's hidden, a module's `busy()` is no
  longer asked; its `flush()` is the last word before it goes.
- `fw.lazy(fn)` imports as normal while stale (no longer reloads at once); it asks `/<app>/version` beside the import at
  most once a minute per app; a build other than the mounted entry's `BUILD` sets `F.stale` (the import is still used).
- When the import rejects, the frame asks `/<app>/version` at once; a different build sets `F.stale` and reloads at the
  route once `!F.busy()`. The module's error state's Try Again calls `fw.lazy` again: stale → that reload; else the
  import again with a new URL. For that, `fw.lazy(fn)` calls `fn(q)` with `q = ""` until an import of this app has
  rejected, then `q = "?retry=<n>"` (n counts this app's rejections): modules write `fw.lazy((q) => import("./x.js" +
  q))` (a module that writes `fw.lazy(() => import("./x.js"))` still works; its Try Again after a failed file is a
  reload). `roofcontract` reads the first string literal inside each `import(`: it must be there.
- `fw.stale()` exists (stage 1); the module never reloads itself.

## 8. Keeping files offline (s2 C4, s4 C11/C12) — done in j0
- `connector.files` = the entry's static import graph + REGISTRY css; `connector.lazy` = the static closure of every
  literal `fw.lazy(() => import("…"))` target, less `files`, less `NET[app]`; `files ∩ lazy = ∅`; `files ∪ lazy` ≤ 60.
- `NET` (in `roofcontract`): Weather = the radar stack, rain files, `/weather/vendor/`; Fitness = `map.js mapstyle.js
  share.js formats.js fit.js reader.js` and `/weather/vendor/`; Markets, Mail = none.
- `modules.preload` reads `files` only. `keepOffline(app, build, files)` after mount; `keepOffline(app, build,
  [...files, ...lazy])` again only standalone, at idle, ≥ 10 s after the first show.
- Root worker (`sw.js`): one list `MODS = { weather: …, markets: …, fitness: …, mail: { name: "Mail", base: "/mail/",
  host: "email" } }` gives `KEEP_APPS`, `ROOF_DOCS`, `FRAMEWORK`, `APPS`, `NAME`, `BASES`, `HOSTS`; `keep()` accepts
  `files ∪ lazy` under `/<app>/` (≤ 60, never `vendor/`, never the app's `sw.js`/`version`); `moduleFile`/`fromModule`
  by app prefix, cache `roof-<app>-<build>`; navigations to any module's `/<app>/`, `/<app>/index.html` as `/weather/`'s.
  `SHELL = "today-app-4"`. Mail's notice step (s4 §6.4) is in `notify(d)`.

## 9. C5 — IndexedDB and Workers in a module
`indexedDB` only in `<app>/roof/idb.js`, opening only `REGISTRY[app].idb`. A Worker only as `fw.lazy(() => new
Worker(new URL("…", import.meta.url), { type: "module" }))`. `roofcontract` greps both.

## 10. Host (`today/public/app.js`) — done in j0
- `heard/askHub/hubReady/applyHub` read and keep `apps` (§2); `applyHub` → `F.setRoof(roof, apps)`.
- `retireOld()` (was `retireWeather`): unregister every registration whose scope path is `/<app>/` for each app known on.
- `bootGone` per app with `links[R.link || app]` and the app's path; marker `"1"`.
- `preload(app)` (was `preloadWeather`); idle preload where used here (`wx:places`, `markets:last`, `fitness:meAt`).
- `signOut()`: `await F.flush()` **before** `/api/logout`; if `lost > 0`, asks "Something you wrote couldn’t be saved to its
  app. Sign Out Anyway?" (Cancel / Sign Out). `signedOutNow(sure)` (signed out elsewhere): clears `APP_SESSION_KEPT` from `sessionStorage`
  and `forgetApps({ chat: false })`: at once only when the account itself said so (`sure`: `/api/session`'s 401 or
  `signedIn: false`, or the frame's `lost()`, which asks it first); for any other 401 or the root worker's `signedout`, only
  after a fresh `checkSession()` answers `false` (review I-8: a stray 401 never wipes the apps' copies). **Live change**
  for stage 1 users (not behind a switch): go-live notes must list it.
- `APP_KEPT` += `mail:replies mail:unsent mail:outbox mail:remote-images mail:lens`; `APP_SESSION_KEPT =
  ["mail:signin-verifier"]`.
- `opts.changed` → Today's cards marked stale; Today's `onShow` asks for them again when marked.

## 11. CSP (s4 C13) — done in j0
`_headers` `/*` and `roof.js` `PAGE_HEADERS` (equal, `roofserve.test`): `connect-src` and `frame-src` gain
`https://email.inflite.ai http://email.ifl.test:8788`. Nothing else widens.

## 12. `roof.yml` / `hub.sh` (rollback level 1) — done in j0
| `app` | `state=off` | `state=on` |
|---|---|---|
| `all` (default; stage 1's) | puts `ROOF_OFF=1` | deletes `ROOF_OFF` |
| `weather` | puts `ROOF_OFF_WEATHER=1` | puts `ROOF_OFF_WEATHER=0`; refused while `ROOF_OFF` is set, as below (review I-4) |
| `markets` / `fitness` / `mail` / (`chats`) | puts `ROOF_<APP>=0` | puts `ROOF_<APP>=1`; refused while `ROOF_OFF` is set: "Every module is off (ROOF_OFF). Turn them all on first." |

⚖ s2 deleted on off; s4 always puts. Per-app switches **put only** (one code path, nothing to find first, the value is
visible in the dashboard); `all` keeps stage 1's put/delete exactly. For `mail`, Mail's Worker `inflite-email` gets
`HUB_API` (inflite.ai) / `HUB_API_NEXT` (next.inflite.ai) = the same `"1"|"0"` **first, both ways**.
- `hub.sh`: `roof_secret APP STATE` → `NAME VALUE|-` (the one table); `roof_set W NAME VALUE|-` (`-` = delete, with the
  existence check on the given name); `worker_settled` accepts `inflite-email`; `wait_roof SITE APP true|false [secs]`
  reads `.apps[APP]` (`.roof` for weather from a stage-1 Worker; `all`: on = `.roof` **or any module in `apps`** true
  (ROOF_OFF gone, Weather perhaps off by its own switch; the step names the modules still off by their own switches),
  off = `.roof` and every `apps` false; review I-4), for `mail` also the
  preflight from the chosen origin and `/body/`'s status; `roof_verdict` names the module. Never `wrangler versions
  secret put`. Same concurrency group, settled check and `where` input.
- `roof.yml` input `app`: `all | weather | markets | fitness | mail`, default `all`.

## 13. Test contracts (MAIN) — done in j0
- `hubstack.mjs`: any argument `roof-<app>` → `ROOF_<APP>: "1"` (`roof-mail` also sets Mail's `HUB_API_TEST: "1"`),
  `roof-off-weather` → `ROOF_OFF_WEATHER: "1"`, `roof-off` as now. Mail's pass-through for the root Worker: port 8807 →
  Mail's Worker (:8806), `MAIL_VIA: "http://127.0.0.1:8807"` in IFL's vars; `MAIL_KEY: "mail-test-key"` in Mail's vars
  (and the account's, `server.sh`). `server.sh` gives the account `MAIL_VIA=http://127.0.0.1:8807` in every run (it starts
  before `run.sh` knows a test's needs, and run.sh isn't j0's); where Mail's stack isn't up nothing listens there, so MT's
  account code must treat a refused connection to `MAIL_VIA` as "no Mail" (as on the real site when Mail's Worker is
  down). Unset, the account would fall back to `appOrigin("email")`, which in the tests is just as dead.
- `unit/fixtures/roof.mjs`: `roofSkip` (stage 1), `mailSkip` (reason when IFL `email/public/roof/mail.js` is missing),
  `appsSkip` (reason when IFL's `router.js` has no `markets` entry: the IFL beside predates j0).
- `unit/fixtures/budget.mjs`: `staticGz(app)` → `{ js, css, files }` KiB (minify.mjs's esbuild options, gzip -9).
- `rooflib.mjs`: `meter(p, app = "weather")`, `connectorFiles(app = "weather")`, `moduleBuild(app = "weather")`,
  `staticGz(app)`.
- `roofkit`: `?module=/<app>/roof/<app>.js` loads any REGISTRY app's real module from disk (Mail's from IFL
  `email/public/roof/`), `/<app>/version` per app, `?apps=weather,markets` sets the session's `apps`. The fake module
  stays the default for Weather's path. The kit page's CSP copy includes `http://email.kit.test`.
- `roofhooks.mjs` gains stage 2's hooks (s2 handoff B0 step 4) and stage 4's (s4 §10.2): see the file.
- `roofui`: `roof/*.js` gzip cap **24 KB** = 24,576 B (was 20; stage 1 left it at 20,452 B). After j0 (review fixes
  included) it is **22,350 B**, leaving 2,226 B: since j0 did most of FW's framework parts, **stage 2's FW ≤ 850 B more,
  stage 3 ≤ 1,300 B**, about 75 B slack (review I-1; the earlier 1.2 KB + 1.3 KB didn't fit).
- `unit/roofframe.test.mjs` (new, j0, review I-3): runs `createFrame` with a stand-in DOM, history, location and mocked
  timers (the real `router.js`, stand-ins for header/tabs/sheet/search/send/modules/connectors): per-app `setRoof` and the
  bounce (idle, busy, left meanwhile, past 10 s and `hidden`), `F.flush`'s 2 s cap, `fw.lazy`'s version ask and `?retry`,
  connector providers per app (Places kept), a `stay` key's focus and scroll, Weather's pop, `fw.nav.go`'s kinds, the back
  label, `sections: false`, `nav.depth`. A wave batch may add cases to it; the host's parts (Sign Out Anyway?,
  `signedOutNow`) stay roofshell's (FW).
- Budgets (`roofbudget`): Weather JS ≤ 90 KB (after WX), CSS ≤ 14; Markets JS ≤ 40, CSS ≤ 12; Fitness JS ≤ 85, CSS ≤ 22.
  Mail's are `roofmailcontract`'s (s4 §4.5).

## 14. Done in j0, and what's left for the wave

Done in j0 (stage 2's FW and SV, and stage 4's batches, skip these): every item marked "done in j0" above, i.e.
- FW: `frame.js` (roofs/apps, `setRoof(roof, apps)`, C7 reload rules and `fw.lazy`'s version ask and retry, `fw.changed`,
  C9 sections/back/nav.go/stay, nav.depth, flush, providers per app), `modules.js` (apps gate, link, C4 keep rule),
  `connectors.js` (per-app connector/fallback, `connectorProvider`, `{ userId }`), `app.js` (heard/askHub/hubReady/
  applyHub with apps and `ifl-roof-apps`, trust rule per boot app, bounce marker RI4, `retireOld`, `bootGone` per app with
  link, `preload(app)`, `signedOutNow` → `forgetApps({ chat: false })`, `opts.changed` + Today's onShow refetch, C10
  sign-out flush and "Sign Out Anyway?", Mail's kept keys), `search.js` (no duplicate apps; sections by `view.apps`),
  `toast.js` (`{ close }`); tests `roofpage`, `roofui`.
- SV: `roof.js` (MODS, roofOn, appsOn, modOf, docOf, filesOf, retireSw/retireWorker per app, CSP), `hub.js` (`apps`,
  per-app documents/retiring worker/301/404), `sw.js` (MODS, today-app-4, keep files ∪ lazy per app, fromModule per app,
  openIn per framework window, Mail's notice), `_headers`; `roof.yml` (app input), `hub.sh` (roof_secret, roof_set W
  NAME VALUE, roof_refused, wait_roof SITE APP, roof_verdict, worker_settled + inflite-email), `hubstack.mjs` flags;
  tests `roofswitch` (new), `roofserve`, `hubworker`, `rootsw`, `todaysw`, `todayfiles`; workflow harness
  `roof/j0-roof-test.sh` (38 cases through tf/i0-wfsim.py).
- B0 (stage 2) and B0-a (stage 4): router, stubs, hooks, fixtures (`mailSkip`, `appsSkip`, `fileOf`), `budget.mjs`,
  rooflib helpers, roofkit (any app, `?apps=`), `roofcontract`, `roofbudget`, `roofrouter`.

Bugs that FW's or SV's kit/shell cases find in a "done in j0" part of a j0-owned file (`frame.js`, `app.js`'s host parts,
`sw.js`, `router.js`, `modules.js`, `connectors.js`, `hub.sh`) go back to j0 through the integrator; the wave batch
doesn't edit those lines itself. `search.js` (C14, sections by `view.apps`; no duplicate apps) was changed by j0 though
s4 B0-a listed it under "must not touch": nobody else owns it in s2 §8.2, so j0 owns those lines (integrator to confirm).

What's left for the wave (not j0):
- s2 FW: `you.js` (Markets Evening Wrap, Fitness row, Connected Apps acts); `openConnector`'s extra acts per app; fake
  module/connector toggles and `roofkit.mjs`/`roofshell.mjs`/`roofpage.test` cases for per-app `setRoof`, C7, providers;
  Today's `onShow` refetch is done (§10), its e2e proof is FW's.
- s2 SV: `hubserve.mjs` cases; `roofswitch.test.mjs` beyond j0's cases; `i0-wfsim.py` runs for markets.
- s4 MT: `mailroof.js`; MW/MB: Mail's Worker gate and `/body/`.

---
Signed: j0 (joint B0 for stages 2 and 4), 2026-11-03. Stage 4's lead: _(sign here: batch id and date)_
