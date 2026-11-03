# One roof, stage 2: Markets and Fitness under the roof (build spec, revision 2)

MAIN = `/home/user/up4/tf/georgefarrowgreen`, IFL = `/home/user/up4/tf/inflite`, both read on `claude/one-roof`
(MAIN `0eb3506`, IFL `dee9d49`, stage 1 as it went live). Paths are relative to the repo named; `file:line` is as read
there (lines drift; names don't). Binding, in this order: `roof/addendum.md` (R1 speed, R2 Markets pounds on Today, R3
overlap of stages 2–4), this spec, stage 1's `roof/spec.md` (its contracts §3, §5, §6 and decisions D1–D24 hold unless a
CONTRACT CHANGE below says otherwise), the maps (`map-markets.md`, `map-fitness.md`, `map-today.md`, `map-design.md`).
Revision 2 resolves every BLOCKING and IMPORTANT item of `s2/critique-risk.md` (RB1–RB3, RI1–RI14) and
`s2/critique-build.md` (BB1–BB7, BI1–BI16); each fix is tagged where it lands, and §13 (Replies) lists them all.

Stage 2 is built at the same time as stage 4 (Mail) and goes live on its own, with its own switch. It never edits
`email/**`, `today/public/mailhost.js`, Mail's tests or `.tools/inflite/menu.js|css` (§8.3). The contract changes the
two stages share are made once, in S2-B0, which is the joint R0 of stages 2 and 4 (§3, S2-D20).

---

## 0. In short

- **Markets and Fitness become modules** as Weather is: `markets/roof/*` and `fitness/roof/*` in MAIN, served through
  the hub at `inflite.ai/markets/roof/*` and `/fitness/roof/*`, `import()`ed on first open and kept. Screens: Markets
  Today · Holdings · News; Fitness Today · Activities · Progress. One header, one tab bar, one sheet, one search, one
  Send, the framework's tokens with Markets' green and Fitness's orange as accent.
- **A port through thin adapters, not a redesign** (stage 1's D9; BB2, BB7). Logic moves from each `app.js` into a
  module `core.js` under app.js's own names; views are moved, not re-expressed, onto small adapters (`mkui.js`,
  `fxui.js`) that give them app.js's helper names (`h`, `card`, `row`, `openSheet`, `toast`, `redraw`, …) over `fw`.
  The apps' own CSS comes across re-tokenised, not restyled. finance.inflite.ai and fitness.inflite.ai keep their own
  code, untouched except `BUILD`/`NEWS`.
- **Weather's first open drops under 90 KB** by loading 16 Days, Warnings, Places, Weather Settings and the detail and
  credits sheets only when opened (104.9 KB gzip measured now → ≈ 84–85 KB, §4.5; BB6).
- **Ships dark, switched on one module at a time** (BB1, BI16, RI5). New modules are opt-in: the Worker secret
  `ROOF_MARKETS="1"` / `ROOF_FITNESS="1"` turns each on; absent, `/markets/` and `/fitness/` stay the hub pages exactly.
  Weather stays on unless `ROOF_OFF` (every module) or the new `ROOF_OFF_WEATHER`. `roof.yml` gains `app`.
- **Ten small CONTRACT CHANGES** (§3), C1–C3 and C9 shared with stage 4 under one shape.
- **No new server endpoint, no new notification, no CSP change, no new storage key.**
- Live: MAIN first (Markets and Fitness files inert; Weather's split live on Today 1.10), IFL dark (Today 1.11, both new
  modules off), staging flip, then production flip, Markets first, Fitness after (§11).

---

## 1. Decisions

**S2-D1. Port, don't redesign; standalone untouched.** `markets/app.js` and `fitness/app.js` keep running their own
addresses; only `BUILD`/`NEWS` change (Markets 1.95 → 1.96, `markets/app.js:792`; Fitness 1.67 → 1.68,
`fitness/app.js:1262`). The module re-exports them (`roofcontract` pins equality, as for Weather). Parity tests
(`roofmkcore`, `rooffxcore`) extract same-named functions from each `app.js` and compare results, as `roofwxcore` does.
Rejected: shared `model.js` files that both `app.js` and the module import (touches every path of two live apps for no
stage-2 gain); restyling either app (BB7: Fitness's content CSS alone is 20.9 KB; a restyle is a stage of its own).

**S2-D2. State: one `core.js` per module, the Weather pattern, reset per account.** `S` is one object mutated in place,
with frozen event names and `on(evt, fn) → off` / `emit` (as `weather/roof/core.js:67-77`). Views subscribe and redraw
only their own section; app.js's `render()`/`redraw()` become `emit` through the adapter (`redraw(part)` → the named
event, no part → `"me"`). Function names and signatures stay app.js's (the parity tests and a mechanical port depend on
it). **`start(fw)` rebuilds every account field from scratch and `stop()` drops them** (RI7): Markets `S.me list q
years paid inc isa vs news charts`; Fitness `S`, `meBase`, `held`, `S.sums`, `dataV`, the `once()` caches, the open
IndexedDB handle (closed), the reader Worker (terminated) and `U.metric` (reset to the default). `stop()` also runs when
`fw.session.lost()` resolves `true` (RB1b). A page that signs in again as someone else (Today's `load()` on `visible`
after `showOut`, IFL `app.js:2058-2061`) remounts a fresh frame and gets a clean `S`.

**S2-D3. DOM: only the module's root, its screen and elements it made.** Markets finds `#main #sheet #sbody #tabs
#toast` in `document` (`markets/app.js:808-809`) and patches `#pv #pd #pp #say #pchart` by id (map-markets §5.4); the
module keeps references to elements it built (or `root.querySelector` with `data-k`), never ids, never `document.*`
lookups (§5.1's rule, grepped by `roofcontract`). Views keep focus across redraws (stage 1 UI12; this replaces
Markets' `keepFocus`, `markets/app.js:1241`; BI6).

**S2-D4. Work only while shown and visible.** Markets' `live()` polls every 30 s and listens to `document` visibility
and `online` for the page's life (`markets/app.js:3064-3075`). The module polls between `show()` and `hide()`, only
while `fw.visible()`; on `visible` after ≥ 30 s it refreshes once. News loads whenever Markets is shown (any section),
at most every 15 minutes, so the News badge is never older than that (BI12). Fitness has no poll: on `shown(true)` and
on `fw.on("visible")` while shown it calls `newDay()` first, then `pull()` after ≥ 60 s away, and while shown it keeps
app.js's one-minute day check (`fitness/app.js:2623-2636`; RI2). Background work already started (`older()` fetching
older rides, `routes()` filling missing figures, `activities.js:213`) finishes the batch in hand and starts no other
while Fitness is hidden (BI7). Nothing runs while another screen is shown.

**S2-D5. Lazy by section, kept offline only on the Home Screen.** Each module's static graph is its first section
(Today) plus what every section needs; other sections and sheets not on the first screen load through
`fw.lazy(() => import("…"))` and are listed in `connector.lazy` (C4). `files` are kept offline after the first open, as
stage 1; `lazy` files only in standalone mode, at idle, ≥ 10 s after the first show (RI8). Budgets §4.6.

**S2-D6. Markets amounts stay on the screen (R2 and the privacy rule).** Markets' own screens and Today's Markets card
show pounds (R2; `today/public/cards.js:442-480` unchanged). Anything that leaves the account — Send (stock or
portfolio), search entries, the header's compact title, URLs, `history.state`, `sessionStorage`, `today:*`, pushes
from the module, logs — carries name, sym, pct and day only. The module never `console.*`s figures. Stock Send words are
the hub path's percent words (`markets/app.js:2722-2725`), never the off-hub "at <price>" text (`:2727`); the card is
`stockSendCard` (`markets/send.js:20-28`) packed as `packCard` (`markets/app.js:2735-2737`). Portfolio Send: card
`{ name: "Portfolio", sym: null, pct, day }` as `functions/_todaymkt.js:99` makes it, words "My portfolio is up 0.8%
today" / "down 0.4% today" / "flat today" (BI6). A news story's Share sends its title and link only (`fw.send({ words
})`, no card; `roof/send.js` takes words alone).

**S2-D7. Settings: content in the module, notifications and account in You** (stage 1's UB3 reply).
- Markets: the Evening Wrap switch moves from Markets' settings (`markets/app.js:2765`) to You's Notifications by App,
  beside Alerts (`today/public/you.js:111-116`), over the existing `PATCH /api/notify { markets: { wrap } }`
  (MAIN `functions/api/account/[[path]].js:280`; `GET` already returns it: `functions/_markets.js:686`,
  `[[path]].js:226`). "Values in pounds", "Prices: Yahoo Finance, up to 20 min behind" and the not-advice line
  (`markets/app.js:2766-2769`) become an About sheet (`mk-about`) from a foot link in Holdings, as Weather's credits.
- Fitness: a **Fitness Settings** sheet in the module (like Weather Settings), pages Your Numbers (FTP, weight, HR,
  paces, CSS, zones), Units and Maps, Nights and Check-in, Devices (Garmin, Strava, Apple Health); a Notifications row
  → `/#you=notify`. Saves change only the keys given (`saveSettings(patch)` over the whole record, as Weather's RI6),
  through `PUT /api/fitness/me` as `keep()` does. Account hand-off (`openAccount`) and Appearance are not carried.

**S2-D8. Not carried in stage 2 (said plainly in Questions):** Markets' desk (`markets/desk.js`, ≥ 1100 px,
`markets/app.js:1203-1211`): at ≥ 980 px the phone layout goes to two columns, with a foot row "The desk view is in
Markets on its own" linking Markets' own address (`marketsdesk.mjs` runs at that address and is unaffected; BI8).
Fitness's sidebar and two-pane Activities (`activities.js:54 actsWide`): at ≥ 980 px two columns of cards and a ride
opens as a centred sheet (BI8, Question 4). Fitness's page-wide keys (`fitness/app.js:1172-1183`), its copy/drag/
context-menu guards (`:2646-2647`), View Transitions `morph` (the framework's transitions take its place; BI7), both
apps' sign-in, welcome, theme, push on this phone, updater, menu and service worker (map-markets §2c, map-fitness §1c).

**S2-D9. Kept copies are checked against the framework's user, never `today:session`.** Both apps read
`localStorage["today:session"]` to trust a kept copy at the hub (`markets/app.js:2975-2980`, `fitness/app.js:2700-2702`);
§5.1 forbids that read. The module writes `markets:last` with the account id inside (`{ id, at, me, … }`; BI10) and
draws it (or Fitness's `me:last`) only when that id equals `fw.session.user.id`. The Markets connector's search does the
same check with the id the frame gives it (C6; RB1c).

**S2-D10. Storage: same keys, no new key; cleared on every sign-out.** Markets `markets:*` (`markets/app.js:812-816`);
Fitness `fitness:*` and IndexedDB `fitness`/`files`. You's Sign Out already clears them (`forgetApps`, IFL
`app.js:1067`, from `signOut()` `:1127-1149`). **A sign-out the page finds out about** (a 401 confirmed by
`fw.session.lost()`, the worker's `{ifl:"signedout"}` `:1942`, a session ended elsewhere) goes through `signedOutNow()`
(`:1166-1175`), which today runs only `forgetKept()`: it now also calls `forgetApps({ chat: false })` once the
sign-out is confirmed (never in the offline case; Chat's engine handles its own; RB1a). `todaykept.test` stays green
(no new keys); `roofpage` adds the case.

**S2-D11. Fitness keeps writing Today's snapshot** (`todaySnap`, `fitness/app.js:2150`; `POST /api/fitness/today`)
whenever its data loads while mounted, as the page does now, **and Today's cards follow in-page changes** (RI3): after
any Markets write (holding, buy, order, follow) and after Fitness's `A.today()` resolves, the module calls
`fw.changed()` (C8); Today's screen asks for its cards again on its next show when a change came in since it last
loaded them. Rhythm stays on the phone (map-fitness risk 1); running the planner at framework start is a later stage.

**S2-D12. Fitness files: picker in the module, drop onto the Fitness screen.** The header act "Add Files" (icon
`upload`) opens a module-made `<input type=file multiple accept=".fit,.gpx,.tcx,.zwo,.erg,.mrc,.zip">` synchronously
in the tap. Drop: `dragover`/`drop` on `fw.screenEl` act only when `dataTransfer.types` includes `"Files"` (so Today's
week-grid day drag, `.gday[draggable]` `today.js:104 dragDone`, is kept and never taken as an upload; BI5); the drop
highlight shows inside the Fitness screen only. While Fitness is shown, the module also `preventDefault`s `dragover`
and `drop` on `document` (no import), so a file dropped on the header or tab bar never navigates the page away (RI11);
those two listeners are added on show and removed on hide and unmount. The reader Worker is made inside `fw.lazy` (C5)
and terminated when the batch of files ends (RI10).

**S2-D13. Strava opens in a window of its own from a real tap** (RI6). At the hub today `stravaGo` navigates the page
itself (`location.href = url`, `fitness/app.js:1945-1948`), which a module may not do. The Devices page (and the
first-use card's Devices step) asks `POST strava/connect` when it opens and renders the answer as
`<a class="ifl-btn" target="_blank" rel="noopener" href=…>Connect Strava</a>`; until the URL is in, the button is
disabled with "Getting Strava ready…"; it asks again if the page has been open ≥ 5 minutes. The server returns to
fitness.inflite.ai (`functions/api/fitness/[[path]].js:205-215`); the module re-reads `GET strava` on the next `visible`.

**S2-D14. Retire the hub-scope workers at `/markets/` and `/fitness/`** as stage 1 did `/weather/` (D10). Both apps
register `sw.js` at their hub scope (`markets/app.js:2994`, `fitness/app.js:2653`), and those workers answer navigations
at their scope with the kept page when slow or offline (`markets/sw.js:97`, `fitness/sw.js:101`) and would control the
framework page there (so `{ifl:"keep"}` and `{ifl:"route"}` would miss the root worker). The page unregisters each scope
once that module is known on; the hub serves a retiring `sw.js` per app while it's on (§5.3). At the hub, push
subscriptions are the root worker's, so no one loses notifications.

**S2-D15. Old links keep resolving, no redirects needed** (§2.6): the router reads Markets' and Fitness's existing hash
vocabulary as sections and aliases, and the address is tidied after show (D6).

**S2-D16. Versions and NEWS for both addresses** (BI11). Weather 1.65 → 1.66, Markets 1.96, Fitness 1.68, Today 1.10 →
1.11 (whichever of stages 2 and 4 goes live second raises Today again). `roofcontract` pins each module's `NEWS` to
app.js's, so the words must read true at both addresses: Weather "Weather opens faster inside InFlite"; Markets
"Markets also opens inside InFlite now, with the same header and search as Weather"; Fitness "Fitness also opens inside
InFlite now, with the same header and search as Weather"; Today "Markets and Fitness can open inside InFlite: the same
header, sheets and search". `IFL.built(app, BUILD, NEWS)` on first mount gives each module's note. A module release
reaching an open page is D21, made safe for lazy files by C7.

**S2-D17. Zoom from Today's cards.** The frame keeps zooming from `a.closest(".tcard")` for any app route
(`roof/frame.js:421-432`); the hint stays Weather's (`roof/frame.js:232-236` reads `.wx-now`), so Markets and Fitness get
`hint = null` and call `fw.zoomTarget(heroEl)` when their hero is in (Markets: the portfolio box; Fitness: the day card).

**S2-D18. Header per module.** Title = the section's label; crumb = app icon + name (frame); acts ≤ 2 after Search, each
with an existing glyph and never two with one icon (`hdAct(icon)` selects `[data-act=<icon>]`, `header.js:85`; a new
glyph would mean editing `.tools/inflite/menu.js`, which §8.3 forbids; BI4). Markets: line = the market's state
("London open · closes 16:30", `marketSaid`), compactTitle "Markets · +0.8%" (the day's percent, never pounds), acts
`[{ icon: "plus", label: "Add a Stock" }]`, badges `{ news: newsNew() }`. Fitness: line = today's plan ("Endurance ·
1 h 15 at 18:00", "Rest day", "Done: 42 km"), on Activities "n this year", on Progress "Fitness 64 · Form +5";
compactTitle "Fitness · <line>"; acts `[{ icon: "upload", label: "Add Files" }, { icon: "settings", label: "Fitness
Settings" }]` (Weather's settings glyph). No ▾ pick for either. "Back to Today" over a section titled "Today" is kept
(the crumb tells them apart); checked at 320 px, where the crumb hides first (BI15).

**S2-D19. Reorder by buttons.** Markets' press-and-hold reorder (`movable`, map-markets §2b) becomes Move Up / Move Down
in an Edit mode with an `aria-live` line, as Weather's Places (stage 1 RI19).

**S2-D20. S2-B0 is the joint R0 of stages 2 and 4** (BB1). It freezes one shape for the shared contract changes (C1–C3,
C9), lands `router.js` complete (Markets, Fitness and Mail entries), and writes `roof/s2/contracts.md`, which stage 4's
lead signs before either wave starts. The framework code for the shared changes (per-app switch in frame/modules/
connectors/app.js; `sections: false`; `nav.go` replace; `stay`) is built once, by S2-FW and S2-SV, generically: stage 4
then adds only its REGISTRY-driven entries and Mail-only lines (its CSP origin, its worker notice). Stage 4's modules
code against the frozen `fw` from day one; before S2-FW merges, `{ replace }` and `sections: false` are simply ignored
(harmless). Stage 3 (Chats) adopts the same shape (opt-in `ROOF_CHATS`, `apps`, `stay` in place of its `keep`).

**S2-D21. Busy means unsaved** (RB2). `instance.busy()` is true while anything would be lost by a reload: Markets
`!calm()` (`markets/app.js:2900`) or a reorder not yet saved; Fitness `S.dirty.size || saveT` (a debounced save
pending, `fitness/app.js:950`), an upload or file read in flight, or the Rhythm setup sheet open. Fitness's `hide()`
flushes a pending save at once (`inStep()` without the 700 ms wait). Every framework reload that isn't the user's own
navigation waits for `!F.busy()` (C7).

**S2-D22. Memory in a page that never reloads** (RI10). Hidden sections drop their heavy DOM (charts, lists, the route
map) after 5 minutes out of sight (Weather's rule) and redraw from `S` on show; the reader Worker ends after each import
batch; the route map is destroyed when its sheet closes; `fxui`'s `ResizeObserver` is disconnected in `unmount()`;
Markets' chart cache (`S.charts`) keeps the open stock's only.

---

## 2. What the user sees

### 2.1 Markets (accent: Markets green, `map-design` §3.2)
- **Today**: the portfolio hero (value, day's change in £ and %, range 1D/1W/1M/1Y as `ifl-seg-sm`, chart; empty state
  "Nothing you own yet" with Add a Stock), the day's words (`daySaid`), insight cards, movers, indices, following.
- **Holdings**: rows (name, symbol, value, day %), mix ring, accounts (each opens `mk-account`, `accountView :1924`;
  BI6), Income card, Against the Market card, Edit (reorder, S2-D19), foot "About these prices" (`mk-about`) and, at
  ≥ 980 px, the desk row (S2-D8).
- **News**: For You and the markets' stories, grouped (`newsGroups`), the section's badge = new stories. A story's
  menu (`storyMenu :2095`): Hide This Source, Share (S2-D6).
- **Sheets** (`data-sheet`): `stock` (chart with five ranges, yours, facts, why it's moving, buys, alert %, Send,
  Remove), `add-stock` (shell and field made in static `markets.js` and focused synchronously in the tap; results from
  `GET /api/markets/search` and your recent searches, `recent :2508`, filled by lazy `edit.js`; RI9), `holding`
  (shares, paid, account), `income`, `isa`, `vs` (with What If, `whatIf :1807`), `story`, `mk-account`, `mk-about`.
- Signed out, offline, error: the framework's (stage 1 D11–D13); offline shows the kept copy with "Prices from 09:40".

### 2.2 Fitness (accent: Fitness orange)
- **Today**: week strip, the week grid (drag a day onto another to swap, kept; BI5), the day card (session, rest or
  done), Ride At, the best time to ride, efforts, the week, the morning check-in, nights, plans waiting from Chat and
  Today's rides (Keep / Undo; static, on first paint; BI2), first-use card (how your rides come in → Devices; your days
  → Rhythm setup; your numbers → Your Numbers) until `prefs.onboarded`.
- **Activities**: sport filter (`ifl-seg-sm`), rows (sport, name, date, distance, time), a find field on this phone.
- **Progress**: fitness, fatigue and form; bests; weekly and yearly; calendar.
- **Sheets**: `act` (route map, charts, zones, efforts, rename, Send, Share a Picture, delete), `act-map` (the full
  route map, `bigMapView`), `act-share` (`shareView`), `session`, `workout`, `fx-day`, `move`, `workouts`,
  `rhythm-setup` (four steps), `send-device` (a `.fit` file through `<a download>` on a blob, `download()`), `offer`,
  `upload`, `form`, `power`, `training`, `engine`, `year`, `fxsettings` (pages `numbers|units|nights|devices`).
- ≥ 980 px: two columns of cards; a ride opens as a centred sheet (S2-D8).

### 2.3 Weather
Unchanged to look at. 16 Days, Warnings, the Places sheet, Weather Settings and the detail/credits sheets show a
skeleton for the moment their file loads on first open; on the Home Screen, offline, they come from the kept copy (C4).

### 2.4 Today, Apps, You
- Today's Markets and Fitness cards are unchanged (pounds stay, R2) and, with the module on, open in-page (zoom); they
  refresh after a change made in the module (S2-D11).
- Apps tiles and chips (`today/public/apps.js:10-15`) open in-page; minis come from the module connectors (Markets
  `pct-spark`, Fitness `num` from `cards.fitness.ctl`), and from the fallback table when a module is off (RI13).
- You: Notifications by App's Markets row gains an **Evening Wrap** switch beside Alerts (S2-D7); the Fitness row ("In
  Today's morning") gains "Fitness Settings ›" → `/fitness/#settings`. Connected Apps' Markets and Fitness rows open
  their connector sheet with "Open <App>" plus "Markets Notifications" → `/#you=notify` / "Fitness Settings".
- InFlite's menu (photo) unchanged (stage 1 D24).

### 2.5 Search (on device only, stage 1 D16)
- Apps provider: "Markets · Holdings" → `/markets/#holdings`, "Fitness · Progress" → `/fitness/#progress`, … (from
  REGISTRY for an app that is on; STATIC's for one that is off).
- Connector providers, one per module that is on, registered by the frame whether or not the module has been opened
  (C6; RI1). A module's own provider, while mounted, replaces only its own connector provider; Weather's places stay
  in Search after Markets or Fitness is opened.
- Markets connector `search(q, { userId })`: nothing unless `markets:last.id === userId` (C6); then holdings and followed
  stocks by name or symbol, ≤ 8, title = name, sub = "TSCO · Shares" (plain symbol and kind; never a value), href
  `/markets/#s=<SYM>`; plus "Markets · Income", "· ISA", "· Against the Market", "· About these prices"
  (`/markets/#income|#isa|#vs|#about`); and, when `q` is ≥ 2 characters, **Find "<q>" in Markets** (`run` → the
  add-stock sheet with `q` filled in). The query leaves the phone only when that entry is tapped, as Markets' "Find and
  add" does today (`markets/app.js:1150`; BI3; Question 13).
- Fitness connector `search(q)`: "Fitness Settings", "Your Numbers", "Garmin, Strava and Apple Health"
  (`/fitness/#settings`, `#settings=numbers`, `#settings=devices`). While mounted, the module's provider adds your
  activities by name, sport or date (≤ 8, `/fitness/#act=<id>`), coming sessions (`/fitness/#day=<date>`) and library
  workouts (`run` → the workout sheet).

### 2.6 Deep links: every address that must keep resolving (module on; off = the hub page as today)

| Address | Today | Under the roof |
|---|---|---|
| `/markets/`, `/markets/index.html`, `/markets` | hub page (`today/src/hub.js:142` 301 for the bare one) | framework, Markets Today |
| `/markets/#today` `#holdings` `#news` | hub page tab (`markets/app.js:1172-1182`) | that section |
| `/markets/#s=TSCO.L`, `#s=%5EGSPC`, `#s=GBPUSD%3DX` | stock page (`SYMBOL`, `markets/app.js:1173`) | Today + `stock` sheet (C1) |
| `/markets/#income` `#isa` `#vs` `#about` | none | Holdings + that sheet (new, for search) |
| `finance.inflite.ai/#s=SYM` (Today card `functions/_todaymkt.js:39`, Chat cards' `ref.sym`) | standalone | standalone (unchanged); at the hub `IFL.hub.go` maps it to `/markets/#s=` (`cards.js:39-45`) |
| Alert push `./#s=SYM` (`functions/_markets.js:806`), wrap push `./` (`:862`) | root worker → `/markets/#s=`, `/markets/#today` (`today/public/sw.js:246-264`) | same paths, routed in-page (§5.4) |
| `/fitness/`, `index.html`, `/fitness` | hub page | framework, Fitness Today |
| `/fitness/#today` `#activities` `#progress` `#plan` | tabs (`fitness/app.js:2709-2716`) | that section (`plan` → Today) |
| `/fitness/#act=<id>` | ride sheet, older rides fetched first (`fitness/app.js:2727-2732`) | Activities + `act` sheet, same rule |
| `/fitness/#day=YYYY-MM-DD` | `lookAt` near, `openDay` far (`:2733-2736`) | Today, same rule |
| `/fitness/#offer=<uuid>` | `openOffer` (`:2737`) | Today + `offer` sheet |
| `/fitness/#settings[=page]` | none | Today + Fitness Settings (new) |
| Today's day buttons `/fitness/#today`, `#activities` (`functions/_todayday.js:326,401,417,457`), card `fitness/#today` (`_todayfit.js:30`) | hub page | in-page |
| Fitness morning push `./` (`functions/_fitpush.js:138`) | `/fitness/#today` (`sw.js` `wanted`) | in-page |
| `fitness.inflite.ai/#strava=on|no|error|taken` (`[[path]].js:214`) | standalone | standalone (unchanged, S2-D13) |

Every app route is tidied to the section's own address once shown (stage 1 D6); neither module uses `stay`.

### 2.7 Notifications and their taps
No new kind. Markets price alert (title "Tesco is up 3.2%", body with the price, `functions/_markets.js:806`) → stock
sheet in-page; Evening Wrap ("Up £123 today", R2) → Markets Today; Fitness's morning → Fitness Today. With the
framework open the root worker routes in-page (`{ifl:"route"}`); with Chats open it opens as now; with no window it
opens that address (framework when the module is on, hub page when off).

---

## 3. Contract changes (the smallest additions to stage 1's contracts)

All are frozen by S2-B0 in `roof/s2/contracts.md` with the exact names below. JOINT = the same change stage 4 needs,
in the shape both stages now use (BB1). Each is backward compatible: with Markets, Fitness and Mail off, behaviour is
stage 1's exactly.

**CONTRACT CHANGE C1 — route argument (`router.js`).** `ARG` widens from `/^[\w-]{1,40}$/` (`roof/router.js:40`) to
`/^[\w.^=-]{1,40}$/`, applied after one `decodeURIComponent` (a failure → `null` arg). Needed for symbols (`TSCO.L`,
`^GSPC`, `GBPUSD=X`; `_todaymkt.js:39` encodes them). The router splits on the first `=` (`router.js:76-78`), so
`#s=GBPUSD%3DX` decodes to `GBPUSD=X` and re-parses after `format`. Modules still validate (Markets `SYMBOL`, Fitness
`SECTION`); the router still caps 40 characters and refuses control characters.

**CONTRACT CHANGE C2 (JOINT) — REGISTRY entries, `own`, `stay`, `idb`, and the per-app `roof` argument (`router.js`).**
`REGISTRY` gains `markets`, `fitness` (below) and stage 4's `mail` entry exactly as `s4/spec.md` §5 C2 writes it. New
optional fields: `own` (the `F.session.links` key of the app's own address when it isn't the app's name: Markets
`"finance"`, `today/public/app.js:928`; Mail `"email"`), `stay` (keys the D6 tidy leaves in the address; Mail
`["thread"]`; none here), `idb` (C5). `parse(href, { roof })` and `owns`: `roof` is `false`, `true` (every REGISTRY
app: only the frame's own re-parse of an address it already accepted, `frame.js:190`, `:303`) or a map
`{ [app]: boolean }`; an app route is ours only if `roof === true || roof?.[app] === true` (today one flag,
`roof/router.js:77`). Stage 1's boolean cases keep passing.
```js
markets: { app: "markets", name: "Markets", path: "/markets/", own: "finance",
  entry: "/markets/roof/markets.js", connector: "/markets/roof/connector.js",
  css: ["/markets/roof/markets.css"],
  sections: [["today","Today"],["holdings","Holdings"],["news","News"]],
  aliases: { s: "today", income: "holdings", isa: "holdings", vs: "holdings", about: "holdings" } },
fitness: { app: "fitness", name: "Fitness", path: "/fitness/", idb: "fitness",
  entry: "/fitness/roof/fitness.js", connector: "/fitness/roof/connector.js",
  css: ["/fitness/roof/fitness.css", "/fitness/roof/fxviews.css"],
  sections: [["today","Today"],["activities","Activities"],["progress","Progress"]],
  aliases: { plan: "today", day: "today", offer: "today", settings: "today", act: "activities" } },
```

**CONTRACT CHANGE C3 (JOINT) — per-app switch, `/api/hub` and `F` per app.**
- Server (`today/src/roof.js`): `roofOn(env, app = "weather")` = `env.ROOF_OFF !== "1" && (app === "weather" ?
  env.ROOF_OFF_WEATHER !== "1" : env["ROOF_" + app.toUpperCase()] === "1")`. New modules are **opt-in** (absent = off,
  so a Worker that loses its secrets falls back to the hub pages); Weather stays opt-out, with its own new off switch.
  `appsOn(env)` → `{ [app]: roofOn(env, app) }` for every app in roof.js's `MODS` (`["weather","markets","fitness"]`;
  stage 4 adds `"mail"`).
- `GET /api/hub` → `{ ready, roof, apps }`; `roof` = `roofOn(env, "weather")`, kept for 1.10 pages, which read only it.
- Client: `apps` kept as JSON in `sessionStorage["ifl-roof-apps"]` (`{"weather":true,"markets":false}`: app names and
  booleans only) beside `ifl-roof`; a missing `apps` means `{ weather: roof }` (a stage-1 Worker).
- `F.session.apps` (each already ANDed with `hub`); the callers that decide (`roofOn()` in `frame.js:76`, used at
  `:88`, `:163`, `:428`; Today's `here`, `app.js:1405`) pass the map `hub ? apps : false` to `parse`.
- `F.setRoof(v, apps)`: an app that turns off is unmounted; if it is showing, D14's bounce (marker, one reload), after
  `!F.busy()` (C7). Apps that stay on are untouched.
- `modules.loadModule` refuses unless `F.session.apps[app]` (`modules.js:37`); own address `links[R.own || app]`
  (`modules.js:59`).

**CONTRACT CHANGE C4 — `connector.lazy`, the `NET` table, and when lazy files are kept** (BB4, RI8).
- `lazy: string[]` = the static closure of every literal `fw.lazy(() => import("…"))` target in the module, less
  `files`, less `NET[app]`. Every dynamic import has a string literal (the test reads it). `files ∩ lazy = ∅`;
  `files ∪ lazy` ≤ 60 (root worker cap, `today/public/sw.js:95`).
- `NET` (a table in `roofcontract`, network-only files never kept or preloaded): Weather = the radar stack, the rain
  files and `/weather/vendor/`; Fitness = `map.js mapstyle.js share.js formats.js fit.js reader.js` and
  `/weather/vendor/`. `/weather/vendor/` is the one cross-app path allowed, and only from a `NET` file (Fitness's
  `map.js` loads maplibre from it, `fitness/map.js:10-14`).
- `modules.preload` reads `files` only (`roof/modules.js:75-87`). `keepOffline(app, build, files)` after mount, as
  now; `keepOffline(app, build, [...files, ...lazy])` again only in standalone mode, at idle, ≥ 10 s after the first
  show (`modules.js:47`).

**CONTRACT CHANGE C5 — IndexedDB and Workers in a module.** Stage 1 bans `indexedDB` in module files (§5.1, RI17).
Allowed now in exactly one file, `<app>/roof/idb.js`, opening only `REGISTRY[app].idb` (Fitness: `"fitness"`, store
`files`, as `fitness/app.js:823` does). A Worker is made only as `fw.lazy(() => new Worker(new URL("…",
import.meta.url), { type: "module" }))` (its script is a `NET` file). `roofcontract` greps both.

**CONTRACT CHANGE C6 — connector search with the user, and a provider per module** (RB1c, RI1).
- `connector.search(q, { userId })`: the frame passes `F.session.view.user.id`. A connector reading account data
  (Markets) returns `[]` unless the kept copy's id equals it.
- `connectors.js`: `connectorProvider(F, app) → off` generalises `placesProvider` (`connectors.js:83-96`); the frame
  registers one for every REGISTRY app whose flag is on (Weather's id stays `"places"`, group "Places"; Markets group
  "Markets", Fitness group "Fitness"). `fw.search.provide` from a module replaces only that module's connector provider
  (`m.provs` per app; `frame.js:378-384` today drops Places for any module, and `places()` `:402-409` brings it back only
  when no module has a provider).
- The STATIC fallback for an app that is off keeps its `mini` (the two functions at `connectors.js:26` and `:29-32`
  move into the fallback table; RI13).

**CONTRACT CHANGE C7 — `fw.lazy` and reloads that never lose work** (RB2, RB3, BI9).
- Every stale reload the frame starts itself (the lazy one, `frame.js:394`; the route one, `:165`, `:242`; the
  visible one, `:457`; the `setRoof` bounce) waits for `!F.busy()`: it checks every second; the bounce gives up waiting
  after 10 s; the others wait for the next route change or `visible`. While busy, `fw.lazy` imports as normal.
- `fw.lazy(fn)` asks `/<app>/version` alongside the import, at most once a minute per app (not D21's 10-minute
  throttle). A build that differs from the mounted entry's `BUILD` sets `F.stale` (the import still resolves and is
  used; the reload comes at the next safe point above).
- When the import rejects, the frame asks `/<app>/version` at once; a different build sets `F.stale` and reloads at the
  route once `!F.busy()`. The module's error state's Try Again then reloads when stale; when not stale it re-imports
  with `?retry=<n>` (a new module record; its static deps still resolve from the map).
- No new `fw` member: `fw.stale()` already exists; the module never reloads itself.

**CONTRACT CHANGE C8 — `fw.changed()`** (RI3). One line in `frame.js`: calls `opts.changed?.()`. Today's `app.js`
supplies it (marks its cards stale); Today's `onShow` (`app.js:1244`) asks for the cards again when marked.

**CONTRACT CHANGE C9 (JOINT, stage 4's C3 and C4, built here so `frame.js` is opened once).**
`fw.header.set({ sections: false })` hides the switcher (frame.js `appHead`, `:228`); `fw.nav.go(path, { replace })`
(`frame.js:370` passes `replace: !!o?.replace`); the D6 tidy (`:299`) leaves the address alone when
`R.stay?.includes(r.key)`. Stage 2 uses none of the three; S2-FW builds them and `roofkit` proves them with the fake
module.

**C10 — none to the module contract.** `CONTRACT` stays 1; the connector contract stays v1 (`lazy` is optional; the
second `search` argument is ignored by connectors that don't need it). Everything else the two modules need is in stage
1's `fw` (§5.2): sheets with `push`, `fw.on("visible"|"hidden")`, `fw.session.user.id`, `fw.session.lost`,
`fw.screenEl`, `fw.zoomTarget`, `fw.lazy`, `fw.send`. No file, share or keyboard API is added (S2-D8, S2-D12).

Host changes that are not contract changes (S2-FW): `signedOutNow()` calls `forgetApps({ chat: false })` once confirmed
(S2-D10); `heard()` clears `ifl-roof-bounce` only when the boot app is null or on (RI4, §5.2).

---

## 4. Module architecture

### 4.1 The pattern both modules follow
- `<app>.js` entry: `CONTRACT = 1`, `BUILD`, `NEWS` (= app.js's), `SECTIONS` (= REGISTRY = connector), `mount(root,
  fw) → instance` (stage 1 §5.1). `mount` builds one `section.<mk|fx>-sec[data-sec]` per section; static sections get
  their view at once, lazy ones a stub view whose first `draw()` shows `fw.ui.skeleton` and loads the real view
  through `fw.lazy`.
- View signature as Weather's: `view(el, ctx) → { draw(), hide(), destroy() }`, `ctx = { S, core, fw, open }`;
  `open.*` are the bound sheet openers (the frozen table, §4.7), each `fw.lazy(() => import("./x.js")).then((m) =>
  m.openX(ctx, …))` for lazy files.
- **Adapters, so views move without rewriting** (BB2). `mkui.js` and `fxui.js` export app.js's helper names over `fw`:
  `h svg icon card row section stat wait toast` build with `fw.ui`'s classes; `openSheet(view) pushSheet(view)
  sheetBack() drawSheet() closeSheet() sheetEl` map onto `fw.sheet.open/push` and the top sheet; `redraw(part)` and
  Markets' `render()` emit core events; `go(tab)` → `fw.nav.section`. Fitness adds `x.js`, which re-exports `core.js`,
  `fxui.js` and `fxcalc.js`, so a ported view's `import … from "./app.js"` becomes `from "./x.js"` and little else
  changes.
- `core.js`: `S`, frozen `EVENTS`, `on/emit`, `start(fw)`, `stop()` (S2-D2), `shown(on)` (S2-D4), `busy()` (S2-D21),
  and the ported functions under app.js's names.
- Rules (stage 1 §5.1, grepped): CSS under `.m-<app>` and `.ifl-sheet[data-app=<app>]`; no `history.*`, `location.*`
  writes, `confirm/alert`, `IFL`, document-wide queries, `today:` keys, `parent.`; `indexedDB` and `new Worker` only
  per C5; every dynamic `import(` inside `fw.lazy(` with a literal; listeners on `window`/`document` only for S2-D12's
  drop guard, removed on hide and in `unmount()`. **The greps cover `<app>/roof/*` only** (as `roofcontract.test.mjs:296`
  does for Weather). Reused files are imported only for their pure and data exports; a view half that breaks the rules
  is never called: `invites.js`'s `openOffer` (a document-wide query, `fitness/invites.js:177`) is ported into
  `offers.js`; `charts.js` sets styles through the CSSOM, not attributes (`markets/charts.js:8`), which the CSP allows
  (BI12).
- `sendable()`: Markets — the open stock (stock sheet) or the portfolio card (Today), S2-D6; Fitness — today's session
  card (`send.js sessionSendCard`/`packCard`, as `fitness/today.js:356-373` builds it).

### 4.2 Markets: files (MAIN `markets/roof/`)

| File | Static/lazy | What (source) |
|---|---|---|
| `markets.js` | static | entry; header (S2-D18); the `add-stock` sheet shell and field, focused in the tap (RI9); search provider while mounted; `show(route)`: section, key `s` + arg → `open.stock(arg)` once `S.me`, `income|isa|vs|about` → that sheet |
| `connector.js` | static | ≤ 4 KB, no imports: `shares` (cards "How your holdings are doing today", search "Your holdings, on this phone", notifications "Price alerts and the evening wrap", actions "Open a stock or a section; send a stock's day in percent", screens "Today · Holdings · News"), `sections`, `aliases`, `files`, `lazy`, `mini` (as `connectors.js:29-32`), `search(q, { userId })` (§2.5) |
| `core.js` | static | `S` (shape of `markets/app.js:810`, minus `tab`, `pushOn`), events `me quotes news list settings loading error`; `store` (`:812-816`); formatters and money (`:842-1035`: `fmt money signed pct tone priceSaid chgSaid plainSym ago rate owned valueOf dayOf divsOf paidFor unpriced leftOutSaid totals byAccount income growthOf isaYear daySeries marketSaid lineSaid insights`); loaders (`take` without the theme, `loadYears loadPaid loadIncome refresh loadNews follow removeHolding alertSet recent`, `:2865-2942`, `:2144`, `:2275`, `:2508-2515`, `:2667`); `live` per S2-D4; `calm`/`busy`; kept copy with id (S2-D9); 401 → `fw.session.lost()`, and `stop()` on `true` |
| `mkui.js` | static | the adapter (§4.1): `h icon openSheet pushSheet drawSheet closeSheet toast render`, plus Markets pieces `sparkCard mixBar vbars range52` ring, chart host over `../charts.js`, the flash-on-change (`paint`, `:2943`) scoped to the module root |
| `todayview.js` | static | Today section (`todayView :1260`, `daySaid :1303`, `portfolioBox :1319`, `portfolioChart :1396`), portfolio Send |
| `holdings.js` | lazy | Holdings section (`holdingsView :1444`, `itemRow :1409`, mix, accounts, income part), `mk-account` (`accountView :1924`), Edit/reorder (S2-D19), `mk-about` |
| `news.js` | lazy | News section, `story` sheet and story menu (`newsView :2116`, `storyRow :2029`, `storyView :2047`, `storyMenu :2095`), imports `../stories.js` |
| `stock.js` | lazy | `openStock` sheet (`stockView :2220`, `yoursPart`, `facts`, `drawBuys`, `buyView`, `whyMoving :2392`, `stockChart :2416`, `alertView :2287`), stock Send (S2-D6) |
| `edit.js` | lazy | `add-stock` results and recent searches (`searchView :2530`, `recent :2508`), `holding` (`editView :2586`, `removeBtn :2657`) |
| `money.js` | lazy | `income` (`incomeView :1659` and parts), `vs` (`vsView :1830`, `whatIf :1807`), `isa` (`isaView :1938`), imports `../income.js` |
| `markets.css` | static | `styles.css` 1-707's sections and sheets re-tokenised under `.m-markets` (map-markets §4); `--pos/--neg` for moves, `MIXC`'s hex (`:1138`) as tokens; desk and generated blocks dropped (measured 10.9 KB) |

Reused unchanged (static): `../account.js` (data calls only), `../charts.js`, `../send.js`. Lazy: `../stories.js`,
`../income.js`.

### 4.3 Fitness: files (MAIN `fitness/roof/`; FXA = core and Today, FXB = sheets, §8)

| File | Static/lazy | Owner | What (source) |
|---|---|---|---|
| `fitness.js` | static | FXA | entry; header (S2-D18); file picker and drop (S2-D12); search provider while mounted; `show(route)`: keys `act`/`day`/`offer`/`settings` per §2.6 (the `openTo` rules of `fitness/app.js:2718-2740`) |
| `connector.js` | static | FXA | ≤ 4 KB: `shares` (as `STATIC.fitness` now, screens without "on its own page for now"), `sections`, `aliases`, `files`, `lazy`, `mini` (as `connectors.js:26`), `search` (§2.5) |
| `core.js` | static | FXA | the engine of `fitness/app.js` under its own names (frozen surface, §4.7): `S` (`:879-889`), `adopt record estimate setNumber logFtp keep inStep rh plannedOn weeks actsOn sumOf held full fileKey readOff load sumUp resum fitnessSeries fetchMe lastMe arrive takeUp pull newDay todayRides todaySnap todayRefresh morningDays forgetCopies wellByDay nightsFrom nightsSeries myPlan planStart rhDay rhythmOn missed lightNow paceFor isSet weekIndex wkById eventDay choosePlan numbers runSpeed swimSpeed weekZip setActs saveFile stopped` and the namespaces `A BT C E F G M P R`; `once()`/`dataV` core-local; events `me acts plan feel offers times settings loading error`; `saveSettings(patch)`; `start/stop/shown/busy` |
| `idb.js` | static | FXA | the one IndexedDB helper (C5): `idb` and the 50-file LRU (`keepFile/dropFile/tidyFiles`, `fitness/app.js:823-860`); `close()` for `stop()` |
| `fxui.js` | static | FXA | the adapter (§4.1): `h svg icon card row section stat wait sportIcon sportTile face stepper calendar toast redraw go openSheet pushSheet sheetBack drawSheet closeSheet sheetEl chooseFiles`; widths `wide mainW partW sheetW cardW mapsAlways` from a `ResizeObserver` on the root (disconnected in `unmount`); zone bars |
| `fxcalc.js` | static | FXA | what Today needs on first paint from the view files: `rhythmSaid dayStamp dayChanges` (plan.js; `dayChanges`' actions call `core.keep`, `fxui.toast` and `ctx.open.move`), `progActs` (progressview.js), `rollAvg` (activities.js); parity-tested against those files |
| `x.js` | static | FXA | `export * from "./core.js"; export * from "./fxui.js"; export * from "./fxcalc.js";` |
| `todayview.js` | static | FXA | Today section: port of `fitness/today.js` (`todayView :17`, `dayStrip :79`, `weekGrid :107` with day drag, `agenda :143`, `dayCard :162`, `rhythmSays :188`, `sessionCard :281`, `rideAtRow/rideAtView :381-391`, `bestTime :444`, `effortsCard :522`, `weekCard :559`, `morningCard :601`, `reviewCard :623`, `nightsView :663`, `feelCard/openCheckIn :713-742`); its calls into plan.js/activities.js openers become `ctx.open.*` |
| `offers.js` | static | FXA | offer cards on Today and the `offer` sheet: the view half of `fitness/invites.js` (`offerCards :112`, `undoToday :162`, `openOffer :170` without the document query, `addView :182`); ≈ 2 KB (BI2) |
| `fitness.css` | static | FXA | Today, Rhythm, check-in, nights, Ride At, sheets' common parts of `fitness/styles.css`, re-tokenised under `.m-fitness` |
| `actsview.js` | lazy | FXB | Activities (port of `fitness/activities.js`: list, `actView :248`, `renameView :335`, `formView :366`, `uploadFilesView :176`, `routes :213`, `older()`), `act-map` (`bigMapView`), `act-share` (`shareView`); `../map.js`, `../share.js` lazy inside it; the route map destroyed when its sheet closes |
| `progview.js` | lazy | FXB | Progress (port of `fitness/progressview.js`, `../progress.js`), `form power training engine year` sheets |
| `planview.js` | lazy | FXB | session, workout, fx-day, move, workouts, Rhythm setup, send to a device with `download()` (port of `fitness/plan.js`); `../formats.js`, `../fit.js` lazy inside it |
| `fxsettings.js` | lazy | FXB | Fitness Settings (S2-D7), ported from `settingsView :1335`, `numbersView :1393`, `garminView :1841`, `stravaView :1950` (S2-D13), `healthView :2013` |
| `fxviews.css` | static (REGISTRY css) | FXB | Activities, Progress, charts, zones, routes, share, settings (`fitness/styles.css` ≈ 352-443 and parts of 854-1066), re-tokenised under `.m-fitness` and `.ifl-sheet[data-app=fitness]` |

Reused unchanged (static): `../workouts.js`, `../load.js`, `../rhythm.js`, `../progress.js` (form on Today),
`../besttime.js`, `../efforts.js`, `../todaycalc.js`, `../charts.js`, `../ui.js` (formatters; `U.metric` set by
`core.adopt` as now, `fitness/app.js:903`, reset by `stop()`), `../account.js` (data calls), `../send.js`,
`../invites.js` (pure half only). NET (lazy, never kept): `../map.js` (+ `../mapstyle.js`, maplibre from
`/weather/vendor/`), `../share.js`, `../formats.js`, `../fit.js`, `../reader.js` (Worker). Never: `../sample.js`.

### 4.4 Imports and `connector.files`
`files` = exactly the static graph from the entry + REGISTRY's CSS (`roofcontract` walks it, as stage 1's
`roofcontract.test.mjs:243-262` does for Weather, generalised per REGISTRY entry); `lazy` per C4. No module imports
another module's files except `/weather/vendor/` from a NET file, and none imports `app.js`.

### 4.5 Weather: loading on open (WX-L; BB6)
- `weather.js` (`weather/roof/weather.js:29-35`) stops importing `days.js`, `warnings.js`, `places.js`,
  `wxsettings.js` statically; `VIEWS.days|warnings` become lazy stub views; `open.places/confirm/day/warning/settings`
  load their file through `fw.lazy`.
- `now.js` imports `listFor, slotOf` from `warnings.js` (`weather/roof/now.js:25`): those and their helpers
  (`warningsOf, nameOf, slotOf, emptyOf, emptyWords, paras, listFor`, `warnings.js:19-62`) move to a new static
  `wxwarn.js`; `warnings.js` keeps `view` and `openWarning` and re-exports the helpers.
- `wxui.js`'s `detailBody`, `openDetail`, `CREDITS`, `creditsText`, `openCredits`, their private helpers `nowOf later
  year link mid`, and `ABOUT` (`wxui.js:194-208`, `372-554`) move to a lazy `wxdetail.js`. **`wxui.js:217-253`
  (`thermometer pressureDial rainBars fillBar meter tideCurve big sub`) stays**: `tileSays`/`tilesEl` (`:257-361`) draw
  Now's "Right now" card (`now.js:239`) with them. `now.js:24` calls `ctx.open.detail/credits` instead of importing
  them, and its re-export at `now.js:395` goes. `roofwxviews.test.mjs:164-259` reads `detailBody`, `CREDITS`,
  `creditsText` from `wxdetail.js`.
- `connector.files` loses those five; `connector.lazy` gains them (C4). REGISTRY css unchanged (`wxsettings.css` is
  0.8 KB gzip and must be in before a sheet opens).
- Measured (each `min/weather/**` file, gzip -9): static graph now 104.9 KB; without days, places and wxsettings 91.3;
  with the warnings and detail/credits moves **≈ 84–85 KB**. `roofweather` part 8 goes back to `JS_MOST = 90`
  (`.tools/tests/roofweather.mjs:430-432`; it is 110 since stage 1's go-live). If the build measures over 90, the
  fallback is lazy `insights.js` (16.4 KB, used by Now's insight cards; a bigger job), not `climate.js` (now.js imports
  it, `now.js:18`).

### 4.6 Transfer budget (first open of the first section, empty HTTP cache, gzip of the served minified files)

| Module | JS | CSS | Same-origin JS/CSS requests | Measured / estimate |
|---|---|---|---|---|
| Weather | ≤ 90 KB | ≤ 14 KB | ≤ `files.length + 2` | ≈ 84–85 / 11.9 (§4.5) |
| Markets | ≤ 40 KB | ≤ 12 KB | ≤ `files.length + 2` | ≈ 26–30 (core ≈ 11.4, Today + mkui ≈ 4.9, entry ≈ 3, connector 1.2, reused 4.0) / 10.9 |
| Fitness | ≤ 85 KB | ≤ 22 KB | ≤ `files.length + 2` | ≈ 78–81 (reused 38.8, Today 18.7, engine 7.9, entry/fxui/fxcalc/idb/connector ≈ 8, offers ≈ 2) / 20.9 |

CSS budgets are what a port needs (BB7 option a): REGISTRY CSS is awaited before mount (`modules.js:40`) and no CSS
loads lazily, so Fitness's 20.9 KB of content CSS is all first-open; restyling to reach 14 would be the redesign S2-D1
rules out. Fitness's JS budget is raised from 80 for the same reason (RI12: reused pure files alone are 38.8). If a
Fitness build measures over 85, these go lazy in order: the best-time card with `besttime.js` (2.3), nights, efforts.
Proven in the unit suite by `roofbudget.test.mjs` (minifies each `files` entry with `minify.mjs`'s esbuild options and
gzips; seconds, no hub; BI1); `roofweather`/`roofmarkets`/`rooffitness` meter the real thing at integration.
Preload (stage 1 D2) applies per module: idle preload only where the app was used here before (`wx:places`,
`markets:last`, `fitness:meAt` exist), else on `pointerdown`/`focus` of a link to its path; on a module-path boot at once.

### 4.7 Frozen surfaces (S2-B0 writes them as stub files with these exports; BB2)
- **Markets** `core.js` exports the §4.2 core row names; `mkui.js` the adapter names; every view file `view(el, ctx)`
  or its opener. **Fitness** `core.js` exports the §4.3 core row names (= `fitness/app.js:2806-2813`'s export list less
  the shell exports `IFL HUB signOutHere signedOutHere openAccount settingsView garminView stravaView healthView
  shareView bigMapView upload layOut head setExamples`, which become openers or go); `fxui.js` and `fxcalc.js` as §4.3.
  Stub functions throw `new Error("not yet: <name>")`; `S` shape and `EVENTS` are final; each stub file exports
  `STUB = true` (the real ones don't).
- **`ctx.open` table** (name → file, signature, `data-sheet`):

| Opener | File | Signature | Sheet |
|---|---|---|---|
| Markets `stock` | stock.js | `(sym)` | `stock` |
| `addStock` | markets.js (shell) + edit.js | `(q = "")` | `add-stock` |
| `holding` | edit.js | `(sym)` | `holding` |
| `income` / `isa` / `vs` | money.js | `()` | `income` / `isa` / `vs` |
| `story` | news.js | `(id)` | `story` |
| `account` / `about` | holdings.js | `(name)` / `()` | `mk-account` / `mk-about` |
| Fitness `act` | actsview.js | `(id)` | `act` |
| `actMap` / `actShare` / `rename` / `form` / `upload` | actsview.js | `(id)` / `(id)` / `(id)` / `(id)` / `(files)` | `act-map` / `act-share` / `act` (pushed) / `form` / `upload` |
| `session` / `workout` / `day` / `move` / `workouts` | planview.js | `(day)` / `(id, day?)` / `(day)` / `(day)` / `()` | `session` / `workout` / `fx-day` / `move` / `workouts` |
| `rhythmSetup` / `sendDevice` | planview.js | `(step = 0)` / `(wid, day)` | `rhythm-setup` / `send-device` |
| `power` / `training` / `engine` / `year` | progview.js | `()` / `()` / `()` / `(y)` | as named |
| `offer` | offers.js | `(id)` | `offer` |
| `settings` | fxsettings.js | `(page = null)` | `fxsettings` |

---

## 5. Framework, host, server and hub (IFL)

### 5.1 Framework (`today/public/roof/`)
- `router.js`: C1, C2 (S2-B0).
- `frame.js`: `roofOn()` (`:76`) becomes `roofs()` → `hub ? apps : false`, passed to every deciding `parse` (`:88`,
  `:163`, `:428`; the two `roof: true` re-parses at `:190`, `:303` stay); `setRoof(v, apps)` (`:123-135`) per C3; stale
  reloads per C7; `fw.changed` (C8); C9; search providers per C6 (`:378-384`, `places()` `:402-409` → one connector
  provider per on app); `hint` only for `weather` (S2-D17).
- `modules.js`: refuse unless `s.hub && s.apps?.[app]` (`:35-37`); own address via `links[R.own || app]` (`:59`); keep
  per C4 (`:47`); `fw.lazy`'s version ask (C7).
- `connectors.js`: `STATIC` keeps `chats`, `mail` (`:21-36`); markets/fitness come from their `connector.js` through
  `connectorOf` (`:46-55`) when their flag is on, else a per-app fallback with the same `shares` words and its `mini`
  (generalise `fallback`, `:39-44`; RI13); `connectorProvider` (C6); `openConnector`'s extra acts per app (today
  Weather's only, `:72`).

### 5.2 Host (`today/public/app.js`, `you.js`)
- `heard/askHub/hubReady` (`app.js:864-901`) read `apps` (C3), keep `ifl-roof-apps`; on a module-path boot, a kept
  answer is trusted only if it says hub yes and that module on (today Weather's rule, `:884-892`). `heard()` deletes
  `ifl-roof-bounce` only when the boot app is null or `apps[bootApp]` is on (RI4: else a framework served at an off
  module's path from the worker's kept `/` would loop).
- `applyHub` (`:913-918`) compares per app and calls `F.setRoof(v, apps)`.
- `retireWeather` (`:921-927`) → `retireOld()`: unregister every registration whose scope path is `/<app>/` for each
  module known on (S2-D14).
- `bootGone` (`:950-969`): own address `links[REGISTRY[app].own || app]` and the app's path (today `/weather` only); the
  bounce marker stays `"1"`.
- `preloadWeather/preloadSoon` (`:975-993`) → `preload(app)` per §4.6.
- `signedOutNow()` (`:1166-1175`): `forgetApps({ chat: false })` once confirmed (S2-D10).
- `opts.changed` (C8) and Today's `onShow` (`:1244`) refetching cards when marked.
- `BUILD`/`NEWS` (`:15-17`): by S2-I (S2-D16).
- `you.js`: Markets row: Alerts seg plus an Evening Wrap switch (`PATCH /api/notify { markets: { wrap } }`, read from
  `n.markets.wrap`); Fitness row link (§2.4).

### 5.3 Server (`today/src/roof.js`, `hub.js`)
- `roof.js` (`:12-14`): `MODS = ["weather","markets","fitness"]`; `roofOn(env, app)` and `appsOn(env)` per C3;
  `modOf(path)` → the app whose document this is (`/^\/(weather|markets|fitness)\/(index\.html)?$/`, built from MODS);
  `ROOF_FILES` per app (`/^\/<app>\/roof\//`); `RETIRE_SW(app)` as today's (`:49-58`) with the app's cache prefix
  (`wx-`, `markets-app-` (`markets/sw.js:48`), `fitness-app-` (`fitness/sw.js:40`)) and its path for the windows it
  navigates; `retireWorker(request, app)`.
- `hub.js` (`:96-107`): `/api/hub` → `{ ready, roof, apps }`; for each read, with `a = modOf(p)` / the app of
  `/<app>/sw.js` / `/<app>` / `/<app>/roof/*`: on → framework page, retiring worker, 301; off → the hub page as today,
  and 404 no-store for its roof files. Everything else unchanged (`PAGES`, `APIS`, `CAPS`, `NEVER` already cover both
  apps, `:20-26`; `wrangler.toml:18` already runs the Worker first for them).
- CSP: none. The page CSP (`roof.js:18`) already allows everything `FIT_SECURITY` and `MKT_SECURITY` do
  (`functions/_fitapp.js:21`, `functions/_mktapp.js:17`).
- MAIN server: no change (both APIs answer at the hub today; `functions/api/markets/[[path]].js:239`).

### 5.4 Root worker (`today/public/sw.js`)
`SHELL = "today-app-4"`; `ROOF_DOCS` (`:74`) and `FRAMEWORK` (`:303`) from one `MODS` list (+ `/`, `/index.html`);
`KEEP_APPS = MODS` (`:95`); `moduleFile`/`fromModule` (`:164-168`) for any `/<mod>/` path, falling back to
`roof-<mod>-*`; `openIn` (`:289-299`) routes in-page for any framework window and keeps the "told to open" fallback for a
module path that doesn't answer route (its hub page with that module off). `openAt`/`wanted` unchanged. Stage 4 adds
`"mail"` to `MODS` and its notice step.

---

## 6. Offline and the service workers

- Offline rules are stage 1's D11 for every module: only in standalone (Home Screen) mode, signed in from the kept
  session; framework from `/`'s copy; module from `roof-<app>-<build>` (`files`, then `files ∪ lazy` once kept per C4;
  all or nothing, `sw.js:89-120`).
- Markets offline: Today/Holdings from `markets:last` (same account only, S2-D9), "Prices from 09:40"; News, Add a Stock
  and charts beyond the kept range say "Needs a connection". Fitness offline: Today, Activities and Progress from
  `me:last` and kept summaries; uploads, maps and Strava say "Needs a connection".
- A lazy file that fails to load shows `fw.ui.error` in that section or sheet with Try Again; the frame first checks
  the version (C7): a new release reloads at the route once nothing is unsaved; otherwise Try Again re-imports with
  `?retry=<n>`. The rest of the module keeps working.
- Old workers at `/markets/` and `/fitness/` are retired twice over (S2-D14): `retireOld()` in the page, and the hub's
  retiring script, which deletes `markets-app-*` / `fitness-app-*` at inflite.ai (never at the apps' own addresses),
  unregisters and re-navigates its windows. Standalone workers at finance./fitness. are untouched.

---

## 7. The switches (one per module)

| `roof.yml` `app` | `state=off` | `state=on` |
|---|---|---|
| `all` (default; stage 1's) | puts `ROOF_OFF=1` (every module off) | deletes `ROOF_OFF` |
| `weather` | puts `ROOF_OFF_WEATHER=1` | deletes `ROOF_OFF_WEATHER` |
| `markets` | deletes `ROOF_MARKETS` | puts `ROOF_MARKETS=1`; refuses with "Every module is off (ROOF_OFF). Turn them all on first." while `ROOF_OFF` is set (RI5b) |
| `fitness` | deletes `ROOF_FITNESS` | puts `ROOF_FITNESS=1`; same refusal |

(stage 4 adds `mail` with `ROOF_MAIL`, stage 3 `chats` with `ROOF_CHATS`, same rows.)
- `.github/hub/hub.sh`: `roof_secret APP STATE` → the secret name and `put|delete` (one table, the only place the
  names live); `roof_set W NAME put|delete` (today `roof_set W off|on`, `hub.sh:752-772`; the existence check reads the
  given name, never a fixed `ROOF_OFF`, `:766`); `wait_roof SITE APP true|false [secs]` polls `.apps[APP]` (`.roof` and
  every `apps` for `all`; `:778-797`); `roof_verdict` names the module ("Markets is back to its own page at
  /markets/"). Same concurrency group, settled check and `where` input as today.
- Proven by `roofswitch.test.mjs` (new, RI5a): sources `hub.sh` with stub `wrangler`, `curl` and `jq` on `PATH`, for
  every `app` × `state`, and asserts the exact secret name, put or delete, the refusal and the verdict words.
- Effect of `app=markets state=off`: `/markets/` is the hub's milestone-1 Markets page again (its `sw.js` re-registers
  on first open), `/markets/roof/*` 404s, `/api/hub` says `apps.markets: false`; open pages learn it on their next
  visible (≤ 5 min) and a shown Markets bounces once when nothing is unsaved (C7, stage 1 D14); Weather and Fitness stay
  modules. Data is shared (`markets:*` unchanged).
- `hubstack.mjs` (`:18`, `:34`): any argument `roof-<app>` → `ROOF_<APP>: "1"`, `roof-off-weather` →
  `ROOF_OFF_WEATHER: "1"`, `roof-off` as now (one generic rule, so stage 4's `roof-mail` needs no edit).

---

## 8. Batches

### 8.1 Order (R1: build only what's named; R3: lighter process, deep review only where risky)
```
S2-B0 contracts = joint R0 with stage 4 (serial, small): router.js complete; contracts.md; stubs with frozen
      exports; roofhooks; roofcontract/roofrouter/roofbudget; roofkit any app from disk; rooflib per-app helpers
  └─ wave, all at once (7): S2-FW framework+host · S2-SV server+worker+switch · S2-WX Weather on open
                            · S2-MK Markets · S2-FXA Fitness core+Today · S2-FXB Fitness sheets · S2-Q acceptance
       (FXB's kit run after FXA merges: the only wait)
          └─ S2-I integration (versions, minify, wxshell, suite, full e2e twice on the extra sessions, go-live)
```
Deep review (R3) only for S2-FW and S2-SV (shared Today code, per-app switch, reload rules) and S2-MK's Send and search
(Markets amounts). FW and SV may be one batch if reviewers are short.

### 8.2 Ownership (no file has two owners; ❄ = frozen by B0)

| Batch | IFL | MAIN |
|---|---|---|
| S2-B0 | `roof/router.js` ❄ | `.tools/tests/roofhooks.mjs` ❄ (gain only), `rooflib.mjs` (per-app helpers, then Q's), `unit/roofrouter.test.mjs` ❄, `unit/roofcontract.test.mjs` ❄, `unit/roofbudget.test.mjs` ❄, `unit/fixtures/roof.mjs`, `unit/fixtures/budget.mjs`, `.tools/tests/roofkit/serve.mjs` and `roofkit/index.html`/`kit.js` (any REGISTRY app from disk, session `apps`); stubs of every `markets/roof/*`, `fitness/roof/*` and new `weather/roof/wxwarn.js wxdetail.js` file → owners below; `roof/s2/contracts.md` |
| S2-FW | `roof/frame.js modules.js connectors.js`, `app.js` (hub/roof/boot/preload/retire/`signedOutNow`/`changed` parts), `you.js` | `unit/roofpage.test.mjs`, `.tools/tests/roofshell.mjs`, `roofkit.mjs` and `roofkit/fake-module.js fake-connector.js` |
| S2-SV | `src/roof.js`, `src/hub.js`, `public/sw.js` | `.github/workflows/roof.yml`, `.github/hub/hub.sh`, `hubstack.mjs`, `hubserve.mjs`, `unit/roofswitch.test.mjs` (new), `unit/roofserve hubworker hubheaders rootsw todaysw todayworker todayfiles .test.mjs` |
| S2-WX | – | `weather/roof/weather.js now.js warnings.js wxui.js connector.js wxwarn.js wxdetail.js`; `unit/roofwxviews.test.mjs`; `.tools/tests/roofwxmount.mjs` |
| S2-MK | – | `markets/roof/*`; `unit/roofmkcore.test.mjs roofmkviews.test.mjs`, `unit/fixtures/mk.mjs`; `mocks/mkroof.mjs` (new; `mocks/marketsmock.mjs` untouched); `.tools/tests/roofmkmount.mjs` |
| S2-FXA | – | `fitness/roof/fitness.js connector.js core.js idb.js fxui.js fxcalc.js x.js todayview.js offers.js fitness.css`; `unit/rooffxcore.test.mjs`, `unit/fixtures/fx.mjs`; `mocks/fitnessmock.mjs` (new); `.tools/tests/rooffxmount.mjs` |
| S2-FXB | – | `fitness/roof/actsview.js progview.js planview.js fxsettings.js fxviews.css`; `unit/rooffxviews.test.mjs`; `.tools/tests/rooffxsheets.mjs` (new) |
| S2-Q | – | `.tools/tests/roofmarkets.mjs rooffitness.mjs` (new), `rooflib.mjs` (after B0), changes to `roofweather.mjs roofnav.mjs roofsw.mjs`, triage of §9.3 |
| S2-I | `app.js` BUILD/NEWS | every BUILD/NEWS, `min/**`, `weather/sw.js` SUMS (wxshell), `suite.txt`, `.tools/tests/README.md`, `roof/s2/golive.md` |

### 8.3 Rules (stage 1 §9.3, plus)
- Worktrees `/home/user/up4/roof2/wt/<b>/{georgefarrowgreen,inflite}` on `roof2/<b>` off `claude/one-roof-s2` (made
  from `claude/one-roof` once stage 1 is live).
- **Kept apart from stage 4:** no edits to `email/**`, `today/public/mailhost.js`, `mailframe/mailhost/hubmail` tests,
  `.tools/inflite/menu.*` (so no `iflmenu.mjs` run). The shared IFL files are changed only in the named functions;
  Mail-only lines (its CSP origin, its notice step, `NAMES`, `APP_KEPT`) are stage 4's, merged by its integrator.
  Today's `BUILD`: whichever stage goes live second raises it again.
- House rules: every pushed change to Weather, Markets or Fitness raises its `BUILD` with `NEWS` in the same commit
  (S2-I); `node .tools/minify.mjs` then `node .tools/wxshell.mjs` (minify covers `markets/roof/*`, `fitness/roof/*`:
  `.tools/minify.mjs:15` pathspecs match subfolders, as `min/weather/roof/` shows; `functions/_min.js:6`). No sign-in
  copy changes.
- e2e only the tests a brief names: module batches prove themselves on the kit page (no hub); hub tests run at S2-I
  (two halves on the extra cloud sessions, R3).

---

## 9. Tests

### 9.1 Unit (MAIN `.tools/tests/unit/`)

| Test | Batch | Proves |
|---|---|---|
| `roofrouter` | B0 | C1 (`TSCO.L`, `%5EGSPC` → `^GSPC`, `GBPUSD=X`, bad `%` → null arg); C2 (`roof` as `false`/`true`/map; markets/fitness/mail sections, aliases, `format` of each; `own`, `stay`, `idb` fields); Weather's cases unchanged |
| `roofcontract` | B0 | for every REGISTRY module present on disk: exports, BUILD/NEWS = app.js's, SECTIONS = REGISTRY = connector; connector ≤ 4 KB, no imports, words; `files` = static graph + css; `lazy` per C4 (closure of literal `fw.lazy` targets less `files` less `NET`); `files ∪ lazy` ≤ 60; `import(` and `new Worker(` only inside `fw.lazy(` with literals; §5.1 greps over `<app>/roof/*`; `indexedDB` only in `fitness/roof/idb.js` opening `"fitness"`; `/weather/vendor/` only from NET files; CSS scoped; no style attributes; stubs skip their behaviour cases with "still B0's stub" |
| `roofbudget` (new) | B0 | §4.6 JS and CSS budgets per module from `files` (esbuild with `minify.mjs`'s options, gzip -9); prints each figure |
| `roofmkcore` | MK | parity with `markets/app.js` (§4.2 core row) on `fixtures/mk.mjs`; `live` timers only between `shown(true)` and `shown(false)`; start(A) → stop → start(B) keeps nothing of A (RI7); `stop()` on `lost() === true` |
| `roofmkviews` | MK | stock and portfolio Send: packed card keys exactly `v kind from at say snap{name sym pct day} ref{sym}`, words with no `£` and no digits of a value; story Share words = title + link; connector `search` → `[]` for another user id and entries without values for the same one (RB1); "Find" entry has `run`, no href with `q`; kept copy ignored for another user id |
| `rooffxcore` | FXA | parity with `fitness/app.js` (`adopt record plannedOn todaySnap morningDays merge`) and with plan/progressview/activities for `fxcalc`; `saveSettings` keeps unknown keys; fake clock across midnight: `shown(true)` after midnight moves `TODAY` and redraws (RI2); start(A) → stop → start(B) (RI7): `S`, `held`, `S.sums`, `U.metric` clean, IDB closed; `busy()` true while a save is pending |
| `rooffxviews` | FXB | settings pages write only their keys; `openTo` rules (§2.6) on fixtures; Strava's link is an `<a target=_blank rel=noopener>` with the fetched href (RI6) |
| `roofwxviews` | WX | `wxwarn`/`warnings` split; detail/credits words from `wxdetail.js` equal the old `wxui.js`'s |
| `roofserve`, `hubworker`, `hubheaders` | SV | `/api/hub` `apps`; opt-in for markets/fitness, opt-out for weather (`ROOF_OFF_WEATHER`), `ROOF_OFF` turns all off; each module's document, retiring worker (its cache prefix only), 301, 404 for its roof files only when off |
| `roofswitch` (new) | SV | `hub.sh` per `app` × `state`: secret name, put/delete, refusal while `ROOF_OFF`, verdict words (RI5a) |
| `rootsw`, `todaysw` | SV | FRAMEWORK/ROOF_DOCS per module; keep accepts markets/fitness (`files ∪ lazy`), refuses vendor, NET files and over 60 |
| `roofpage` | FW | `ifl-roof-apps` trust rule; `retireOld`; `bootGone` per app with `links.finance` for Markets; `heard()` keeps the bounce marker for an off boot app (RI4); `signedOutNow` clears every `APP_KEPT` key and the `fitness` store when confirmed, nothing when offline (RB1) |
| unchanged, must stay green | – | `todaykept` (no new keys), `markets*`, `fitness*`, `mktsend`, `fitsend`, `min` (after I), `wxshell` (after I); `markets.test.mjs:91` and `fitnessshell.test.mjs:10` list only top-level files, so `roof/` doesn't disturb them |

### 9.2 End-to-end (MAIN `.tools/tests/`)

| Test | Stack | Batch | Proves |
|---|---|---|---|
| `roofkit.mjs` | kit | FW | stage 1's parts + per-app `setRoof` (one module off doesn't unmount another; bounce waits while busy); `sections: false`, `nav.go` replace, `stay` with the fake module (C9); `fw.lazy` while stale and busy imports without a reload, while stale and idle reloads (RB2); lazy rejection with a changed `/<app>/version` → reload at the route (RB3); connector providers: a Weather place found with the fake module's provider registered (RI1) |
| `roofwxmount.mjs` | kit | WX | first open fetches none of `days warnings places wxsettings wxdetail`; each fetched once on first open; settings part through lazy `wxsettings.js` |
| `roofmkmount.mjs` (new) | kit, `mocks/mkroof.mjs` | MK | mount, sections, every sheet of §2.1, header acts, add-stock field focused in the tap, no document-wide lookups at run time, DOM falls after hide + 5 minutes (`page.clock`) |
| `rooffxmount.mjs` (new) | kit, `mocks/fitnessmock.mjs` | FXA | mount, Today (offers on first paint, day drag swaps and isn't an upload), a FIT file through Add Files and the Worker; no Worker left after the batch (`page.workers()`); IndexedDB only `fitness`; a file dropped on the header doesn't navigate (RI11); stale + file picked → imported, no reload (RB2) |
| `rooffxsheets.mjs` (new) | kit | FXB | act (+ map, share), form, session, Rhythm setup, settings pages, Strava window from a real click (RI6) |
| `roofmarkets.mjs` (new, `// needs: hub roof-markets`) | hub | Q | 1 tile and Today card open in-page (one document, zoom); 2 sections by replaceState, Back with scroll; 3 cold links `#s=TSCO.L`, `#s=%5EGSPC`, `#holdings`, `#news`, `#income`, tidied after show; 4 stock sheet: alert %, Remove, Send → engine stand-in, packed card pct only; 5 polling: no `/api/markets/*` while Weather is shown or the page hidden; 6 budget; 7 storage: no new key, no `today:*` change, no amount in URLs, `history.state`, `sessionStorage`, console; 8 401 with session alive → no sign-out; 8b a confirmed sign-out leaves no `markets:*` (RB1); 9 new build mid-session (D21); 10 alert notification tap → stock sheet; 11 You's Evening Wrap → `PATCH /api/notify`; 12 add a holding → Today's card refetched on return (RI3); 13 open Markets, then Search finds a Weather place (RI1); 14 axe, 320/390 light/dark (Back to Today with crumb), 1280 two columns |
| `rooffitness.mjs` (new, `// needs: hub roof-fitness`) | hub | Q | as 1–2, 6–9, 14 for Fitness; cold `#act=<id>` (older fetched), `#day=`, `#offer=`, `#settings=numbers`; `POST /api/fitness/today` on load; Keep an offer → Today's card shows it (RI3); upload through Add Files and onto the screen; settings save keeps other prefs; Weather 16 Days after a Fitness edit within 700 ms: the edit saved, no reload (RB2) |
| `roofweather.mjs` | hub | Q | part 8 at 90 KB; part 14: first open fetches none of the lazy five, 16 Days fetches `days.js` once; part 14b: a changed `wxui.js` export deployed mid-session in the stand-in, then 16 Days → a reload to the new build, not an error (RB3) |
| `roofnav.mjs` (`// needs: hub roof-markets roof-fitness`) | hub | Q | Apps → Markets and Today row → Fitness in-page (`:141-155` rewritten); `apps.markets:false` bounces a shown Markets, Weather stays in-page; a framework served at off `/markets/` (worker fallback stood in) doesn't loop (RI4) |
| `roofsw.mjs` (`// needs: hub roof-markets roof-fitness`) | hub | Q | old `/markets/` and `/fitness/` workers retired (page and hub script); offline standalone Markets and Fitness from kept caches; lazy files kept only in standalone (RI8) |

### 9.3 Existing tests
- With the new modules off by default, `mkthub.mjs`, `ridetime.mjs`, `hubserve.mjs`'s `/markets/` and `/fitness/` cases,
  `todaymoments`, `hubshare`, `todaycards`, `todayshell`, `sitewide`, `chats`, `hubpush`, `ridehold`, `todaysnap`,
  `fitshare`, `perf` run unchanged (they prove each module's "off" is milestone 1 exactly). S2-Q triages only what
  fails in its scratch merge (stage 1's after-live list already moves `ridetime`'s `.atile` selectors to the framework
  tiles; that is stage 1's fix, not this stage's).
- `hubserve.mjs` gains the `roof-markets`/`roof-fitness` cases (SV).

### 9.4 Proof at integration
Unit suite with IFL `claude/one-roof-s2` beside (0 fail) and with live IFL beside (roof cases skip with reason);
`wrangler deploy --dry-run` (prod, `--env next`); full e2e twice on the extra sessions (R3), FAILS 0.

---

## 10. Risks and guards

1. **Fitness is big** (≈ 260 KB of views to port, map-fitness §3). Guard: port through adapters under app.js's names
   (§4.1); frozen surfaces so FXA and FXB run side by side (§4.7); parity tests; standalone untouched; its own switch.
2. **Old hub workers at `/markets/`, `/fitness/`** serve old pages offline or swallow `keep`/`route`. Guard: S2-D14,
   §6, `roofsw`.
3. **Markets amounts leaking** through Send, search, header, URLs, storage, logs. Guard: S2-D6, `roofmkviews`,
   `roofmarkets` part 7, deep review of Send and search.
4. **A kept copy or search shown to the wrong person.** Guard: S2-D9 id in `markets:last`, C6 `userId`, S2-D10
   `forgetApps` on every confirmed sign-out, S2-D2 reset.
5. **A reload that loses work** (stale lazy, bounce). Guard: S2-D21 busy, C7, `roofkit`/`rooffxmount`/`rooffitness`.
6. **Mixed releases in one page** (lazy files after a MAIN deploy). Guard: C7 version ask with each lazy load and on
   failure; `roofweather` part 14b. Until Today 1.11 is live (C7 not there yet), no MAIN push touches
   `weather/roof/*` after stage 2's (§11.1).
7. **Background work** in a page that never reloads. Guard: S2-D4, `roofmkcore`, `roofmarkets` part 5.
8. **IndexedDB/Worker in a module** (C5 relaxes a stage-1 rule). Guard: one file, one database, greps, Worker ended.
9. **Parallel framework edits with stage 4.** Guard: one joint B0 (S2-D20), generic tables, §8.3 file rules.
10. **Weather's split on Today 1.10** (MAIN first), whose `keepOffline` ignores `lazy` and whose `fw.lazy` has no C7.
    Guard: the lazy error state; IFL dark the same day; risk 6's freeze.
11. **Port drift** (two clients write the same records). Guard: Markets data is server-side per call; Fitness's
    record is versioned (`PUT me` 409) and `rooffxcore` pins `record/adopt/merge`.
12. **Memory.** Guard: S2-D22, `roofmkmount`/`rooffxmount` checks.
13. **The switch itself.** Guard: `roofswitch.test`, opt-in default off, the refusal while `ROOF_OFF`, proven both ways
    on staging and production (§11).
14. **Budgets.** Guard: `roofbudget` in every batch's unit run; Fitness's named fallbacks; Weather's `insights.js`.

---

## 11. Going live and rolling back

### 11.1 Order (each step its own check; rollback is the same switch)
1. S2-I's checks (§9.4).
2. **MAIN → `main`**: Weather 1.66, Markets 1.96, Fitness 1.68. Markets and Fitness module files are inert (the live
   router has no entry for them; `/markets/roof/*` is just files through the hub). Weather's split is live at once on
   Today 1.10. Check: main's CI green; `/version` of each app; `inflite.ai/markets/` and `/fitness/` still the hub
   pages; `inflite.ai/weather/` opens, then 16 Days and Weather Settings open (lazy files 200 through the hub). From
   here until step 3 is live, no MAIN push touches `weather/roof/*`.
3. **IFL dark → `claude/inflite` and `dist7t`, the same day**: Today 1.11, `ROOF_MARKETS`/`ROOF_FITNESS` absent. Check:
   `/api/hub` `apps: { weather: true, markets: false, fitness: false }`; `/markets/`, `/fitness/` still the hub pages;
   `/markets/roof/markets.js` 404; `/weather/` the framework; `/version` 1.11; the `inflite` Worker's newest version is
   the deployed one. Stage 4's IFL release can come before or after this one (both dark): no "never in between".
4. **Staging**: `hub-stage.yml inflite_ref=claude/inflite` → next.inflite.ai; `roof.yml app=markets state=on
   where=next.inflite.ai`, then fitness; `/markets/#s=TSCO.L` and `/fitness/#activities` open the framework; a round
   trip through each; `state=off` then `on` for each.
5. **Production, one module at a time**: `roof.yml app=markets state=on where=inflite.ai`. Check: `/api/hub`
   `apps.markets: true`; `/markets/` the framework (noindex, CSP); `/markets/sw.js` the retiring script;
   `/markets/roof/markets.js` 200. Then the same for fitness (the next day if George prefers; Question 12).
6. No other IFL branch push for a day after step 3 (stage 1's rule: keeps the switch usable).
7. Phone checks for George (not a gate): Today's Markets card → Markets → a stock → Send; Fitness → Add Files from
   Files; a price alert tap; Home Screen offline Markets and Fitness.

### 11.2 Rollback, by level
1. **One module back to its hub page** (seconds): `roof.yml app=<markets|fitness> state=off`; Weather alone:
   `app=weather state=off`.
2. **Every module** (seconds): `roof.yml app=all state=off` (stage 1's level 1).
3. **Today back to 1.10** (minutes): revert the stage-2 merge on IFL `claude/inflite` and `dist7t`. MAIN needs none
   (module files inert again; Weather's split works on 1.10). **Before reverting MAIN** (for a standalone Markets or
   Fitness fix), turn that module off first (RI5d).
4. **Everything off**: `hub-off.yml`.

---

## 12. Questions for George (the build uses the default in brackets)

1. Markets' desk view (the big-screen layout) isn't in InFlite yet: on a Mac or iPad at inflite.ai Markets shows its
   phone layout in two columns, with a link to Markets on its own for the desk. OK? [yes]
2. A price alert on the lock screen says the share price in pounds ("£2.84 now", as today). Keep it, or say percent
   only? [keep: it's a public price, not what you own]
3. Fitness's keyboard shortcuts on a computer (1/2/3, U, arrows, J/K) aren't carried into InFlite yet. OK? [yes]
4. On a big screen, Fitness in InFlite shows two columns of cards and opens a ride as a sheet; the sidebar and the
   list-beside-the-ride view stay in Fitness on its own. OK? [yes]
5. Fitness's own settings (your numbers, units, maps, nights, check-in, Garmin, Strava, Apple Health) live in Fitness
   Settings inside Fitness, with a link from You; notifications stay in You. OK? [yes]
6. Dropping files works onto the Fitness screen, not anywhere on the page. OK? [yes]
7. Connecting Strava opens Strava in a new window and finishes on Fitness's own address; back in InFlite, Fitness sees
   it's connected. OK? [yes]
8. The Evening Wrap switch moves from Markets to You, beside Alerts. OK? [yes]
9. Today's Fitness card updates when you open Fitness or change something there, not in the background. OK for now?
   [yes]
10. Markets' header line says how the markets are doing ("London open · closes 16:30"); your money shows only in the
    screen itself. OK? [yes]
11. Weather's faster first open goes live with stage 2's first push, a few hours before Today 1.11 (on the Home Screen,
    offline, 16 Days and Warnings need one online visit until then). OK? [yes]
12. Markets and Fitness go live switched off, then are switched on one at a time: Markets first, Fitness straight
    after if all's well. OK, or a day apart? [straight after]
13. Searching in InFlite offers "Find "Tesco" in Markets"; only tapping it sends the words to Markets' stock search, as
    Markets' own search does today. OK? [yes]

---

## 13. Replies (how each critique item is resolved)

**Risk critique.**
- RB1 sign-out leaves data, search shows it: fixed. S2-D10 (`forgetApps` in `signedOutNow`), S2-D2 (`stop()` on
  lost), C6 `search(q, { userId })`, S2-D9 id in `markets:last`; tests `roofpage`, `roofmkviews`, `roofmarkets` 8b.
- RB2 reload while busy: fixed. C7 (every self-started reload waits for `!F.busy()`; bounce ≤ 10 s), S2-D21 (busy =
  unsaved, flush on hide); tests `roofkit`, `rooffxmount`, `rooffitness`.
- RB3 lazy after deploy: fixed. C7 (version ask with each lazy load ≤ 1/min and on failure; Try Again reload or
  `?retry`), risk 6's freeze until 1.11; test `roofweather` 14b.
- RI1 Places lost, no connector runner: fixed. C6 `connectorProvider` per on app, per-app replacement; `roofkit`,
  `roofmarkets` 13.
- RI2 midnight: fixed. S2-D4 (`newDay()` on show/visible, minute check while shown); `rooffxcore` fake clock.
- RI3 Today's cards stale: fixed. C8 `fw.changed()`, S2-D11; `roofmarkets` 12, `rooffitness`.
- RI4 bounce loop: fixed. §5.2 `heard()` rule; `roofpage`, `roofnav`.
- RI5 switch: fixed. (a) `roofswitch.test`; (b) refusal while `ROOF_OFF` (§7); (c) opt-in, IFL dark, switched on and
  off on staging and on in production after a 200 check (§11.1); (d) §11.2 level 3.
- RI6 Strava popup: fixed. S2-D13 (URL fetched when Devices opens, real `<a target=_blank>`); `rooffxviews`,
  `rooffxsheets`.
- RI7 state outlives sign-out: fixed. S2-D2 (`start` rebuilds, `stop` drops, Worker/IDB/`U.metric`); `roofmkcore`,
  `rooffxcore`.
- RI8 lazy kept in every tab at once: fixed. C4 (lazy kept only standalone, idle, ≥ 10 s); `roofsw`.
- RI9 add-stock focus: fixed. Shell and field static in `markets.js`, results lazy (§2.1, §4.2); `roofmkmount`.
- RI10 memory: fixed. S2-D22; `roofmkmount`, `rooffxmount`.
- RI11 drop outside screen: fixed. S2-D12 document guard while shown; `rooffxmount`.
- RI12 budget, greps: fixed. Fitness JS ≤ 85 with named fallbacks, B0 measures stubs + reused before freezing
  (`roofbudget`); greps cover `<app>/roof/*` only, `openOffer` ported, `charts.js` CSSOM is allowed (§4.1).
- RI13 fallback mini: fixed. C6 last bullet, §5.1.
- RI14 test gaps: fixed. Each has a named home in §9.1/§9.2.

**Build critique.**
- BB1 two shapes: fixed. One joint shape (C2, C3, C9): opt-in `ROOF_<APP>`, `apps`, `ifl-roof-apps` JSON,
  `F.session.apps`, `F.setRoof(v, apps)`, `own`, `stay`; Weather opt-out with `ROOF_OFF_WEATHER` (the "pick one");
  S2-B0 is the joint R0, signed by stage 4's lead; stage 3 adopts it (S2-D20). §7 and §11 rewritten to it.
- BB2 Fitness boundary: fixed. §4.7 frozen surfaces (core export list, fxui adapter, `fxcalc.js`, `x.js`, the
  `ctx.open` table); FXA and FXB in one wave, FXB's kit run after FXA merges.
- BB3 hooks: fixed. S2-B0 adds them (handoff B0 lists each with its owner and selector), act glyphs named (S2-D18).
- BB4 lazy rule: fixed. C4 exact rule, `NET` table, literals, Worker form, `/weather/vendor/` only from NET.
- BB5 shared test files: fixed. B0 generalises `roofkit/serve.mjs` and the kit page; per-batch fixtures and mocks;
  WX owns `roofwxmount.mjs` (§8.2).
- BB6 Weather split: fixed. `wxui.js:217-253` stays; the moved set and `ABOUT`; `now.js:395` re-export dropped;
  `roofwxviews` re-pointed; 84–85 KB; fallback `insights.js` (§4.5).
- BB7 CSS budgets: option (a): Markets ≤ 12, Fitness ≤ 22, recorded why (§4.6); FXB's own `fxviews.css` in REGISTRY.
- BI1 budget order + quick check: fixed (§4.6, `roofbudget`).
- BI2 offers: static `offers.js` (§4.3).
- BI3 Find in Markets: added (§2.5), plus "About these prices"; Question 13.
- BI4 glyphs: `plus`; `upload` and `settings` (S2-D18).
- BI5 drag days: kept; `Files`-only drop (S2-D12).
- BI6 missing Markets pieces: `mk-account`, story menu, What If, recent searches, portfolio Send words, focus kept
  (§2.1, §4.2, S2-D3, S2-D6).
- BI7 missing Fitness pieces: `act-map`, `act-share`, `download()`, `older`/`routes` rule, `calendar` in fxui, `morph`
  dropped (§2.2, §4.3, S2-D4, S2-D8).
- BI8 wide screens: S2-D8, Question 4; `marketsdesk.mjs` unaffected.
- BI9 lazy from a newer release: resolved by C7 instead of `fw.markStale()` (the frame checks the version itself, so
  no per-file `BUILD` to keep in step and no new `fw` member).
- BI10 connector search: stronger than asked: C6 `userId` check plus the id inside `markets:last`.
- BI11 NEWS at both addresses: S2-D16 words.
- BI12 news badge: news loads whenever Markets is shown (S2-D4).
- BI13 line references: corrected (§5.1).
- BI14 FXB kit run: `rooffxsheets.mjs`.
- BI15 Back to Today at 320: kept and checked (S2-D18, `roofmarkets` 14).
- BI16 go-live simplified: §11.1 (MAIN, IFL dark, staging flip, production flip).

**Faster (George asked how the whole process can be made faster).** One joint B0 for stages 2 and 4 (no second
reconciliation, stage 4 starts the same day); opt-in switches and a dark IFL release (no ordering between the two
stages' IFL pushes, no big-bang step); frozen surfaces so all seven batches run at once (FXB waits only for one kit
run); mechanical ports through adapters (smaller diffs, lighter review); `roofbudget` in the unit suite (budget proven
in seconds, no hub); kit tests per batch, hub tests only at integration, split over the extra sessions; deep review
only for FW, SV and Markets' Send/search.
