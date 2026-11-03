# One roof, stage 1: briefs for each batch

One brief per batch. Each is meant to be followed with `spec.md` (beside this file), `addendum.md` (which wins over
both) and the code files it names. Section numbers (§) and decision numbers (D) are `spec.md`'s. Read "Every batch"
first, then your own brief.

- MAIN = the `georgefarrowgreen` repo (Cloudflare Pages: Chat, Weather, Fitness, Markets, the account page, server code
  in `functions/`). IFL = the `inflite` repo (the Worker at `inflite.ai`: Today in `today/`, Mail in `email/`).
- ROOF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof` (this folder: spec, addendum,
  critiques, maps, logs). TF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf` (milestone
  1's folder: `e2e.sh`, `i0-wfsim.py`, results under `state-<name>/`).
- The integration checkouts are `/home/user/up4/tf/georgefarrowgreen` (MAIN, `ce3e311`) and `/home/user/up4/tf/inflite`
  (IFL, `bbd3cf3`), both on branch `claude/one-roof`. **Batches never edit them**: only the integrator merges into them.
- The visual target is the demo `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/superapp/roof-src.html`.

| id | Batch | Wave | Starts after |
|---|---|---|---|
| `b0` | B0 · Contracts | 0 | – |
| `fw` | FW · Framework | 1 | B0 merged |
| `sv` | SV · Server, worker, switch | 1 | B0 merged |
| `wx` | WX · Weather core | 1 | B0 merged |
| `q` | Q · Acceptance tests | 1 | B0 merged |
| `td` | TD · Today, Apps and You | 2 | FW-a merged (its last `roofshell` run after FW-b) |
| `wv` | WV · Weather views | 2 | FW-a and WX merged |
| `ws` | WS · Weather settings | 2 | FW-a and WX merged |
| `i` | I · Integration | 3 | run by the integrator, merging each batch as it goes green |

---

## Every batch

### Set up

Every batch, B0 included, makes its own pair of worktrees side by side (MAIN's tests look for IFL at `../inflite`), on
`roof/<id>` off `claude/one-roof`:

```sh
B=fw                                   # your batch id, lower case: b0 fw sv wx q td wv ws
W=/home/user/up4/roof/wt/$B
mkdir -p $W
git -C /home/user/up4/tf/georgefarrowgreen worktree add $W/georgefarrowgreen -b roof/$B claude/one-roof
git -C /home/user/up4/tf/inflite          worktree add $W/inflite          -b roof/$B claude/one-roof
ln -s /home/user/up4/tf/georgefarrowgreen/.tools/tests/node_modules $W/georgefarrowgreen/.tools/tests/node_modules
ln -s /home/user/up4/tf/inflite/node_modules                        $W/inflite/node_modules
ln -s /home/user/up4/instant/inflite/email/node_modules             $W/inflite/email/node_modules
cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs   # baseline: note pass/fail/skipped
```

If the worktrees already exist (a fix round), `cd` into them and carry on. To pick up batches already merged:
`git -C $W/georgefarrowgreen merge claude/one-roof` (and the same in `$W/inflite`). Do that before any test your brief
says needs another batch.

### Run things

- All unit tests (MAIN's and the IFL-reading ones, from MAIN): `cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs`
- One unit test: `node --test .tools/tests/unit/<name>.test.mjs`
- Module loading (if you touched anything a server imports): `node .tools/tests/unit/imports.test.mjs`
- Parse check: `node --check <file>` for every `.js`/`.mjs` you changed.
- IFL Worker dry run (any IFL change): `cd $W/inflite && npx wrangler deploy --dry-run --outdir $ROOF/dry-$B`
  (SV also `--env next`).
- **End-to-end tests, only through the isolated runner, only the tests your brief names:**
  `$TF/e2e.sh $W/georgefarrowgreen <name> <test> [<test>…]` with `<name>` = your id, or `<id>-<n>` to keep an earlier
  run's results (each run wipes `$TF/state-<name>/`). Results: `$TF/state-<name>/results.log` ("FAILS 0" is a pass; a
  hub test that prints `SKIPPED` is **not** a pass). Logs `$TF/state-<name>/<test>.log`, screenshots
  `$TF/state-<name>/out/<test>/`. At most two runs machine-wide (the runner waits for a slot); put all your tests in one
  call where you can. Never the full suite (that's I's).
- e2e tests select DOM only through `.tools/tests/roofhooks.mjs` (§3.14). A hook you need that isn't there: report it,
  don't invent a selector into another batch's markup.

### Rules

1. **Edit only the files your brief says you own** (§9.2 is the full table). If you need a change in someone else's
   file, stop and report it in your hand-off (`needsFromOthers`); don't make it.
2. **The names other batches use are fixed** by B0 (❄ in §9.2/§9.4, and every export in §3.1, §5, §6.1, §7.1). Keep
   them; add, don't rename.
3. **Never** push; never bump a version (`BUILD`, `NEWS`, `APP_VERSION`, `APP_NEWS`); never run
   `node .tools/minify.mjs`, `node .tools/wxshell.mjs` or `node .tools/iflmenu.mjs` (nor `signin.mjs`); never edit
   `.tools/tests/suite.txt`. Integration does all of that.
4. Until integration, `min.test.mjs` and `wxshell.test.mjs` may be red, and only for files you changed. Every other unit
   test must be green, in both IFL states: a MAIN unit case that needs the roof in the IFL beside skips with `roofSkip`
   from `unit/fixtures/roof.mjs` and says why; a case you rewrite keeps its milestone-1 assertion for the other state
   (§9.3, [RB4]).
5. **Privacy rule 6, always:** no message words, no Chat place names and no Markets amounts ever reach a server, a
   request URL or body, a push, `localStorage`/IndexedDB under `today:*`, or a log. Chat stays end-to-end encrypted.
   Search is on device only (D16). Every string from data goes through `textContent` or `esc()`. No inline styles or
   inline handlers (the pages' CSP refuses them).
6. **Hub mode keys on the server's marker** (`IFL.hub.on`), never on the hostname. Standalone apps at their own
   addresses (weather.inflite.ai and the rest) behave exactly as today.
7. Words on screen: British English, plain words, title case on buttons as the apps already do ("Open Weather on Its
   Own", "Try Again", "Weather Settings").
8. **No model names or model IDs** anywhere: not in commits, code, comments, logs or test names.
9. Commit on `roof/<id>` in each repo you changed: small commits with plain messages, each ending with exactly these two
   lines:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_014XnqoGQHbED3n4J5zbYg9i
   ```
10. Work fast (addendum R1): build what your brief and the spec ask, prove it with the checks named, nothing more.
11. Append a short log to `$ROOF/<id>-log.md` (what you built, decisions, commands and their counts, what's left), so
    whoever comes next can pick up from it. When done, report: what you built, the test commands and results (unit
    pass/fail/skipped counts, each e2e `FAILS n`), the commits, anything not done and why, and anything you need from
    another batch.

### What "Done when" means

Every item proven by a command you ran in your own worktrees on your final commit, with the counts in your report.
"FAILS 0" for each e2e test named; unit suite 0 failing (skips only with their stated reason); `node --check` clean;
dry run ok where IFL changed.

---

## B0 · Contracts

**Goal.** Make every name, file, hook and test helper more than one batch uses, so no batch waits on or edits another's
file. Nothing user-visible changes. Serial, alone, before wave 1.

**Read first:** spec §0–§3.3, §3.8 (static dialog markup), §3.14, §5, §6.1, §7.1 (openers, view signature), §9.2,
§9.4 B0, §10.1; `map-today.md`, `map-weather-client.md`; IFL `today/public/app.js` (the shared block's exports:
`IFL.header/headerHtml/hub/built/here`), MAIN `.tools/tests/unit/todayfiles.test.mjs`, `todayworker.test.mjs` (the
`tfSkip` pattern), `weather/app.js` (the names `core.js`/`sync.js` will port).

**Owns** (and hands on, per §9.2; ❄ = frozen for everyone after you):
- IFL: `today/public/roof/router.js` ❄ (complete); `today/public/roof/{frame,header,tabs,sheet,toast,ui,search,send,
  modules,connectors}.js` and `roof.css` (stubs → FW; the token block ❄).
- MAIN: `weather/roof/weather.js`, `connector.js`, `core.js`, `sync.js`, `places.js`, `radarview.js`, `wxcore.css`,
  `radar.css` (→ WX); `now.js`, `days.js`, `warnings.js`, `wxui.js`, `weather.css` (→ WV); `wxsettings.js`,
  `wxsettings.css` (→ WS); `.tools/tests/roofhooks.mjs` ❄; `.tools/tests/unit/fixtures/roof.mjs` ❄;
  `.tools/tests/unit/roofrouter.test.mjs` ❄, `roofcontract.test.mjs` ❄; `roofpage.test.mjs` (new, → TD);
  `todayfiles.test.mjs` (only the move below, → SV).

**Must not touch:** anything else. No user-visible change: Today's `app.js`/`index.html` don't import the framework yet.

**Build:**
1. `router.js` in full (§3.3): `REGISTRY` (with the four CSS files), `TABS`, `parse` (tab `arg`, combined query + hash,
   aliases, arg rule, query cap), `format`, `owns`, `ownPath`. Pure: no DOM, no storage.
2. Stubs of every other framework file with the final exports of §3.1 and contract comments; `createFrame(opts)`
   returns an `F` with every member of §3.2 present (no-ops), `F.forModule(app)` returns every member of §5.2.
   `roof.css`: the token block of §3.13 (names and values exactly `map-design` §3.2, light/dark rules as app.css);
   component rules empty.
3. Weather module stubs (§5.1, §7.1): `weather.js` with `CONTRACT`, `BUILD = "1.64"`, `NEWS` = `weather/app.js`'s
   current values (I raises both later), `SECTIONS` ❄, `mount` returning a placeholder instance with every method;
   `connector.js` final shape, `shares` words ❄ exactly §6.1, `sections`, `aliases`, `files` = the 30 files of §7.3
   (12 own, 14 reused, 4 CSS), `mini`/`search` minimal; `core.js` exports and `S` shape ❄, event names ❄,
   `saveSettings(patch)`, `peek`, `fromLink`; every view file with `view(el, ctx) → { draw, hide, destroy }` and its
   openers ❄ (`openPlaces`, `confirmPlace`, `openDay`, `openWarning`, `openDetail`, `openCredits`, `openSettings`).
   Each stub statically imports the reused files its real version will use (so the graph is the agreed one), every
   dynamic import sits inside `fw.lazy(`, and each stub exports `STUB = true` (the real files don't), so WX's
   `roofwxmount` can skip, with a logged reason, the parts that test views still stubbed. Empty CSS files.
4. `roofhooks.mjs`: §3.14 as named exports (one constant per hook, with its owner in a comment).
5. `unit/fixtures/roof.mjs`: `MAIN`, `IFL` (`../inflite` beside, or null), `roofSkip` (string reason when
   `IFL/today/public/roof/router.js` is missing, else false).
6. Move, unchanged, the two page-structure cases of `todayfiles.test.mjs` ("nothing Today draws has an inline style or
   an inline script…", "its page is InFlite’s one page…") into `roofpage.test.mjs`, with the same skips.

**Tests:** `roofrouter.test.mjs` and `roofcontract.test.mjs` exactly as §9.4 B0 lists (including the static-graph walk:
follow `import … from "…"` relative paths from `weather/roof/weather.js`; every reached file must be in
`connector.files`; none may be under `vendor/` or be `radar.js`, `radarmix.js`, `radarwork.js`, `mapstyle.js`,
`mapgl.js`, `mapleaf.js`, `rainmap.js`, `radarrain.js`; and the §5.1 greps).

**Done when:** unit suite green (with your new cases; also run once with `IFL` moved aside by pointing the test at a
missing path, to see the roof cases skip cleanly); `node --check` on every file; IFL dry run ok; e2e `todayshell
todaypage` FAILS 0 (nothing user-visible changed).

---

## FW · Framework (wave 1)

**Goal.** The framework of §3 and the module API of §5.2, exactly, proven in isolation on a kit page. Merged in two
parts: **FW-a** (frame, header, tabs, sheet, toast, ui, roof.css, the kit page with `?module=`) as early as you can,
because TD, WV and WS start from it; then **FW-b** (search, send, modules, connectors, roofkit complete).

**Read first:** spec D2–D4, D6, D14, D18–D24, §2.3, all of §3, §5.2, §9.4 FW; `map-design.md` (tokens, components,
motion, a11y); `map-today.md`; the demo's prototype; IFL `today/public/app.js` shared block (`IFL.header`,
`headerHtml`, `watch`, `settle`, `hub.tabs`, `hub.go`, `built`, `here`), `app.css`, the copied `menu.css` block in it.

**Owns:** IFL `today/public/roof/frame.js`, `header.js`, `tabs.js`, `sheet.js`, `toast.js`, `ui.js`, `search.js`,
`send.js`, `modules.js`, `connectors.js`, `roof.css` (the B0 token block may only gain); MAIN
`.tools/tests/roofkit.mjs`, `.tools/tests/roofkit/**` (kit `index.html`, `fake-module.js`, `fake-connector.js`, any kit
helper), `.tools/tests/unit/roofui.test.mjs`, `roofsearch.test.mjs`.

**Must not touch:** `router.js`, Today's `app.js`/`index.html`/`app.css`/`apps.js`/`you.js` (TD), anything in MAIN
`weather/`.

**Build (each item is a spec section; build it as written):**
- `frame.js` §3.2, §3.4, D20–D22: interceptor, `popstate` (sheets closed, re-stamp, render), `scrollRestoration`,
  scroll maps per entry and per section, `ifl-roof-y` on `pagehide`, `{ifl:"route"}` listener, edge swipe (standalone
  only), `F.stale` and the boundary reload (D21, writing `ifl-here:today` from `opts.save()`), `F.fill`, `F.restamp`,
  `F.setRoof`, zoom with the card clone (§2.3, §3.7), the address tidy after `show` (D6), `html[data-app|data-route]`,
  focus rules (§3.15), Back labels.
- `header.js` §3.5: row 1 from `IFL.header()`, crumb, icon-only Back, min title width, `compactTitle`, switcher (manual
  activation, lens recomputed on show, badges), compaction with `IFL.watch/settle`.
- `tabs.js` §3.6: `has-pill`, the sliding pill in menu.css's colour, `aria-current` rules, the Apps-from-an-app rule.
- `sheet.js` §3.8 (frozen static markup), D22; `toast.js` §3.9; `ui.js` + `roof.css` §3.13 (components, reduced
  transparency, contrast, forced colours, safe areas, landscape); transitions §3.7 (types, `hasUAVisualTransition`
  skip, accent cross-fade, CSS fallback, reduced motion).
- `search.js` §3.10 (static; sheet and input made and focused synchronously in the tap); `send.js` §3.11.
- `modules.js` §3.12, D2, D14, D21: hub re-ask through `opts`, import deadline, contract check, CSS await,
  `IFL.built`, `watchVersion` (visible, ≤ every 10 min), `keepOffline`, `preload`, error state with
  `retry`/`own`/`reload`, `fw.lazy`/`fw.stale`; `connectors.js` §3.12, §6.1: `STATIC` (words each app really fills),
  `connectorOf`, `miniOf`, `openConnector`, `placesProvider`.
- `fw.session.lost()` (D3): debounced `opts.checkSession()`, `opts.lost()` only on a confirmed sign-out.
- Kit page (part of FW-a), as §9.4 FW: real shared block extracted from IFL `app.js` between its markers, IFL
  `today/public/` from disk, signed-in session, stand-in tab screens, fake module/connector, `?module=<entry>` for a real
  module.

**Tests:** `roofui.test.mjs` (builders escape, no style attributes or inline handlers in `roof/*.js`, ARIA, header
skeleton equals `IFL.headerHtml()`'s, budget ≤ 20 KB gzip with comments stripped); `roofsearch.test.mjs` (providers
merge/order/timeouts/throwing; a fake `fetch` that fails the test if called; no storage or history writes); `roofkit.mjs`
with every check listed in §9.4 FW.

**Done when:** unit suite green; `node --check` on every file; IFL dry run ok; e2e `roofkit` FAILS 0. Report FW-a as
ready (with its commit) as soon as the kit page, frame, header, tabs, sheet, toast, ui and roof.css pass their roofkit
parts, so the integrator can merge it for wave 2; then finish FW-b.

---

## SV · Server, worker, switch (wave 1)

**Goal.** `/weather/` answers the framework with roof on; the retiring worker; the roof-off 404; `/api/hub` roof; the
root worker's new navigation, keep and route rules; the page CSP; the off switch with its settled check.

**Read first:** spec D7, D10, D14, §2.1, §8 (all), §9.4 SV, §10.3, §11; `map-servers.md`; IFL `today/src/hub.js`,
`today/src/index.js`, `today/public/sw.js`, `_headers`; MAIN `functions/_wxapp.js` (`CONNECT`, `IMAGES`),
`.github/hub/hub.sh` (`give_key`, the API helpers), `hub-off.yml`, `hub-stage.yml`; `TF/i0-wfsim.py` (the workflow
harness).

**Owns:** IFL `today/src/hub.js`, `today/src/roof.js` (new), `today/public/sw.js`, `today/public/_headers`; MAIN
`.github/workflows/roof.yml` (new), `.github/hub/hub.sh`, `.tools/tests/hubstack.mjs` (argv `roof-off` → `ROOF_OFF: "1"`
in VARS), `.tools/tests/wxhub.mjs` (first line only: `// needs: hub roof-off`), `.tools/tests/hubserve.mjs`;
`.tools/tests/unit/hubworker.test.mjs`, `hubheaders.test.mjs`, `todayworker.test.mjs`, `todayfiles.test.mjs`,
`todaysw.test.mjs`, `rootsw.test.mjs`, `roofserve.test.mjs` (new). (`run.sh` already passes a test's `// needs:` words
to `hubstack.mjs` as arguments, so `// needs: hub roof-off` reaches it.)

**Must not touch:** `today/public/app.js` and the rest of Today's page (TD), `roof/*` (FW), anything in `weather/`.

**Build:** `roof.js` and the `hub()` insertion exactly §8.1 (`roofPage` with no conditional headers, `PAGE_HEADERS` set
over assets' headers, HEAD without body; `RETIRE_SW` §8.4; 404 no-store for `/weather/roof/*` when off; 301 for
`/weather`); `/api/hub` → `{ ready, roof }`; root `sw.js` §8.2 (`today-app-3`, FILES, `/weather/` navigation fallback
never `put`, `{ifl:"keep"}` validation and all-or-nothing, module files network-first with cache fallback and 404s passed
through, `openIn` → `route` for framework windows); `_headers` CSP §8.3 (= `PAGE_HEADERS`) and `/roof/*` no-cache;
`hub.sh` `worker_settled`, `roof_set`, `wait_roof` and `roof.yml` §8.5 (concurrency group, token check, step summary,
level-2 words on refusal; never `wrangler versions secret put`).

**Tests:** as §9.4 SV, each rewritten case keeping its milestone-1 assertion under `roofSkip` (§9.3).

**Done when:** unit suite green with IFL `roof/sv` beside and with the roof files absent (point a scratch copy of MAIN at
IFL `claude/inflite`, or temporarily rename `today/public/roof/router.js` in your IFL worktree and restore it: the roof
cases skip, nothing fails); `node --check`; IFL dry run ok (prod and `--env next`); e2e `hubserve wxhub` FAILS 0;
`bash -n .github/hub/hub.sh`; the `roof.yml` YAML-free check and the `i0-wfsim.py` dry runs (settled → set; not settled →
refused, nothing changed).

---

## WX · Weather core (wave 1)

**Goal.** Weather's module entry, connector, state and sync port, Places, and Radar on a phone; the small radar/map
options with standalone unchanged.

**Read first:** spec D2, D3, D9, D11, D16, D19–D21, §5, §6.1, §7 (all, especially §7.1's WX rows and the radar.js
changes), §9.4 WX; `map-weather-client.md`; MAIN `weather/app.js` (state, pipeline, l.3244–3378 sync, `fromLink`,
`cards()`), `weather/radar.js`, `mapgl.js`, `mapleaf.js`, `weather/styles.css` l.1451–1798, `.tools/tests/wxhub.mjs`
(third-party stand-ins), `mocks/wxappdata.mjs`.

**Owns:** MAIN `weather/roof/weather.js`, `connector.js`, `core.js`, `sync.js`, `places.js`, `radarview.js`,
`wxcore.css`, `radar.css`; `weather/radar.js`, `weather/mapgl.js`, `weather/mapleaf.js`;
`.tools/tests/unit/roofwxcore.test.mjs` (new), `wxradar.test.mjs`; `.tools/tests/roofwxmount.mjs` (new).

**Must not touch:** `weather/app.js` and every other standalone Weather file; `now.js`, `days.js`, `warnings.js`,
`wxui.js`, `weather.css` (WV); `wxsettings.*` (WS); anything in IFL.

**Build:** `weather.js` (header with `compactTitle`, Weather Settings act only, `badges.warnings`, `show(route, hint)`
dispatch to the openers, search provider); `connector.js` (keep `files` = the static graph + CSS as it grows); `core.js`
(the port, `saveSettings(patch)` from the whole stored object, `fromLink` never asking for `wx:places`/`wx:acct`
places, `peek`, rain files through `fw.lazy`); `sync.js` (port; 401 → `await fw.session.lost()`, `false` → "Couldn’t
sync with your account"); `places.js` + `wxcore.css` (one-tap rows with tick and temperature, Edit with live line, Find a
place focused in the tap, My Location, `confirmPlace`); `radarview.js` + `radar.css` (`fw.fill`, `fw.lazy` radar import,
`full:false, explore:true, light`, rebuild on theme, destroy after 5 min out of sight, the overlay layout, offline line);
`radar.js` options (`full:false` with every `full` use guarded, `explore:true`, `light`, `destroy()`); `mapgl.js`/
`mapleaf.js` `import.meta.url` vendor URLs.

**Tests:** `roofwxcore.test.mjs`, `wxradar.test.mjs` and `roofwxmount.mjs` exactly as §9.4 WX lists. `roofwxmount`
also carries, from the start, a **views part** (Now hero, warnings slot, credits sheet, 16 Days with Days by, a day
sheet, Warnings and its empty states, a detail sheet) and a **settings part** (Weather Settings opened on every page via
§3.14's hooks, a Units change saved, `glass` kept in the `PUT` body): each part runs only when the page reports its
files' `STUB` export absent, and otherwise logs "part skipped: <file> is still B0's stub" (not a failure). WV and WS
prove their work by these parts; write them from §7.1's WV/WS rows and §3.14.

**Done when:** unit suite green; `node --check`; e2e `roofwxmount` FAILS 0 (after merging `claude/one-roof` with FW-a
in). **Not yours to run:** `wxapp`, `wxacct` need Weather's `SUMS` regenerated for your `radar.js`/`mapgl.js`/
`mapleaf.js` edits, which only I may do (rule 3); I runs them right after merging WX and sends any failure back to you.
Prove standalone defaults unchanged instead with `wxradar.test.mjs`'s default cases.

---

## Q · Acceptance tests (wave 1; run in wave 2 and by I)

**Goal.** The three hub-stack acceptance tests that prove stage 1 end to end, written against the spec and the frozen
hooks before the code exists, then run once TD, WV, WS and SV are merged.

**Read first:** the whole spec, especially D6, D10, D11, D14, D20–D23, §2.3, §3.14, §7.3, §10.2; `TF/spec.md` §14
(the hub stack); MAIN `.tools/tests/lib.mjs`, `hubstack.mjs`, `run.sh`, `wxhub.mjs`, `hubpush.mjs`, `todaymoments.mjs`,
`hubshare.mjs`, `mocks/wxappdata.mjs`, `roofhooks.mjs` (B0's).

**Owns:** MAIN `.tools/tests/roofweather.mjs`, `roofnav.mjs`, `roofsw.mjs` (each first line `// needs: hub`),
`.tools/tests/rooflib.mjs`; and in `hubpush.mjs`, `todaymoments.mjs`, `hubshare.mjs` only the assertions that name
Weather's old page DOM (§10.3).

**Must not touch:** `lib.mjs`, `run.sh`, `hubstack.mjs` (SV), any test another batch owns, any app code.

**Build:** `rooflib.mjs` as §9.4 Q (alive marker, main-frame navigation counter, push/replace recorder, budget meter,
Weather third-party stand-ins, standalone emulation, the never-to-weather.inflite.ai guard, `launch()` honouring
`BROWSER=webkit` when installed); `roofweather.mjs` steps 1–13, `roofnav.mjs`, `roofsw.mjs` exactly as §10.2's table,
each step's log line naming the spec section it proves; selectors only from `roofhooks.mjs`.

**Done when:** each file passes `node --check`; then, once TD, WV, WS and SV are merged into `claude/one-roof` and into your branch: e2e
`roofweather roofnav roofsw` FAILS 0 (`hubpush todaymoments hubshare` too if you changed them). A failure that is
another batch's bug: report it with the step and log, don't change the test to fit.

---

## TD · Today, Apps and You (wave 2, after FW-a)

**Goal.** Today's page on the framework: Today, Apps and You as framework screens, the host page's session, hub, roof and
boot rules, the Weather Notifications sheet in You, and Today's card's warning chip into Warnings.

**Read first:** spec D6, D10–D16, D20–D24, §3.2 (`opts`), §3.6, §3.8 (static markup), §3.10 (Today and Settings
providers), §3.14, §4 (all), §9.4 TD; `map-today.md`; IFL `today/public/app.js` (`hubReady`, `start`, `load`,
`signedIn`, `signedOutNow`, `hubSays`, the `#signin` handler, `openMenu`, `fromHash`, `goFromHash`, the worker `open`
path), `index.html`, `app.css`, `apps.js`, `you.js`, `cards.js`; MAIN `functions/api/account/[[path]].js`
(`notifySettings`, `setNotify` `weather` shapes), `.tools/tests/todayshell.mjs`, `todaypage.mjs`, `todayphases.mjs`,
`mocks/todaystub.mjs`.

**Owns:** IFL `today/public/app.js`, `index.html`, `app.css`, `apps.js`, `you.js`, `cards.js`; MAIN
`.tools/tests/roofshell.mjs` (new, stub stack like todayshell), `todayshell.mjs`, `todaypage.mjs`, `todayphases.mjs`,
`mocks/todaystub.mjs`, `.tools/tests/unit/roofpage.test.mjs`, `todaydaypage.test.mjs`.

**Must not touch:** `roof/*` (FW), `sw.js`, `_headers`, `today/src/*` (SV), `day.js`, `day.css`, the shared block inside
`app.js`/`app.css` (between the iflmenu markers: it is a copy; rule 3), anything in MAIN outside the files above.

**Build:** §4.1 item by item (frame creation and screen specs, header specs, photo → `openMenu` with Connected Apps,
sheets as `ifl-sheet` with the frozen markup, three-way `hubReady` with `roof === true`, `hubAgain`, the `start()`
unregister, `/weather/` boot rules with preload, `then=` in href and click, `replaceState` keeping state + `F.restamp()`,
`save`/`IFL.here`, `pagehide`/`pageshow`, Today and Settings providers, `checkSession`, `F.destroy()`); index.html
modulepreload links and hosts; §4.2 Apps minis; §4.3 You (Connected Apps words, Weather Notifications sheet over the
existing `/api/notify`, the Weather row's words, `/#you=<id>`); §4.4 the chip href.

**Tests:** `roofpage.test.mjs` as §9.4 TD; `roofshell.mjs` with every case §9.4 TD lists; the edits to `todayshell`,
`todaypage`, `todayphases`, `todaydaypage`.

**Done when:** unit suite green; `node --check`; IFL dry run ok; e2e `roofshell todayshell todaypage todayphases` FAILS
0, with `roofshell`'s final run after FW-b is merged into your branch.

---

## WV · Weather views (wave 2, after FW-a and WX)

**Goal.** Weather's Now, 16 Days and Warnings sections, the detail and credits sheets, and their CSS, on the framework's
components, matching the demo and keeping everything standalone Weather shows.

**Read first:** spec D18, §5.2, §7.1 (WV rows), §7.3, §9.4 WV; `map-design.md` §9 (Weather's data colours),
`map-weather-client.md`; MAIN `weather/app.js` (`cards()`, the hero, status, warnings, `layout`), `weather/detail.js`
l.39–250, `weather/index.html` (`#credits`, `#alerts`, Days by), `weather/styles.css` l.700–762; IFL
`today/public/cards.js` + `day.css` (the `.tcard.wx` hero markup); the demo.

**Owns:** MAIN `weather/roof/now.js`, `days.js`, `warnings.js`, `wxui.js`, `weather.css`;
`.tools/tests/unit/roofwxviews.test.mjs` (new).

**Must not touch:** WX's and WS's `weather/roof/*` files, every standalone Weather file, IFL.

**Build:** as §7.1's WV rows: Now (hero with `hint.sky`, status line with Retry, warnings slot, cards in layout order
skipping `daily`/`radar`, credits line, two columns at ≥ 980 px), 16 Days (Days by Temp/Rain/Wind, `openDay`),
Warnings (`openWarning`, the two empty states), `wxui.js` (`skyClass`, strip, range bar, `openDetail`, `openCredits`
verbatim), `weather.css`. Only the reused files B0's stubs import, statically; anything else through `fw.lazy`.

**Tests:** `roofwxviews.test.mjs` as §9.4 WV.

**Done when:** unit suite green; `node --check`; e2e `roofwxmount` FAILS 0 with its views part running, not skipped
(your files no longer export `STUB`; merge `claude/one-roof` with WX and FW-a first); once TD and SV are merged, e2e `roofweather` FAILS 0 (if they aren't yet, say so and the integrator
runs it); screenshots at 320/390/768/1280 in light and dark (from `roofwxmount` or `roofweather`) looked at against the
demo, with what you fixed in your log.

---

## WS · Weather settings (wave 2, after FW-a and WX)

**Goal.** The Weather Settings sheet with its pages on the framework, saving through `core.saveSettings` so standalone
Weather and the account stay in step.

**Read first:** spec §7.1 (WS row), §7.4, §4.3 (where Notifications now lives), §9.4 WS; MAIN `weather/settings.js`,
`weather/app.js` (`loadSettings`, `defaults`, `CARDS`, `layout`), `weather/index.html` (the settings sheet).

**Owns:** MAIN `weather/roof/wxsettings.js`, `wxsettings.css`; `.tools/tests/unit/roofwxsettings.test.mjs` (new).

**Must not touch:** any other `weather/roof/*` file, standalone Weather, IFL.

**Build:** `openSettings(ctx, page)` with pages Units, Arrange Now (Move Up/Down with live line, show/hide, `daily` and
`radar` not listed and left as they are), Best Times, Commute, Solar, Forecast, and the Notifications row →
`/#you=notify-weather`; saves via `core.saveSettings(patch)` with only the edited keys; `wxsettings.css` under
`.ifl-sheet[data-app=weather]`.

**Tests:** `roofwxsettings.test.mjs` as §9.4 WS.

**Done when:** unit suite green; `node --check`; e2e `roofwxmount` FAILS 0 with its settings part running, not skipped
(merge `claude/one-roof` with WX and FW-a first; WX wrote that part against §3.14's hooks and it runs once
`wxsettings.js` no longer exports `STUB`; if it fails on a hook or a step that is wrong, report it to WX with the log,
don't edit WX's test); once TD and SV are merged, `roofweather` part 6 FAILS 0 (else the integrator runs it).

---

## I · Integration (run by the integrator)

**Goal.** Merge every batch into `claude/one-roof` as it goes green, make the shared changes, prove the whole thing,
and go live as George asked ("Build it and push"), following §11.

**Owns:** `.tools/tests/suite.txt`, `.tools/tests/README.md`, IFL `README.md`, `min/**`, `weather/sw.js`'s
`SUMS`/`CACHE` lines and `weather/index.html`'s version mark (by `wxshell.mjs`), every `BUILD`/`NEWS`, the final trim of
`connector.files`, `$ROOF/golive.md`.

**Must not touch:** batch-owned code beyond those lines. A behaviour conflict goes back to its owner.

**Steps:**
1. Merge B0 (`git merge --no-ff roof/b0` in both repos, in `/home/user/up4/tf/*`); unit suite. Tell wave 1 to start.
2. Merge wave 1 as each goes green: FW-a first, then SV, WX, Q, FW-b. After merging WX: `node .tools/minify.mjs && node
   .tools/wxshell.mjs`, commit, then e2e `wxapp wxacct` (back to WX on failure). After each merge, tell running batches
   they may merge `claude/one-roof`. Start wave 2 as its prerequisites land.
3. Merge wave 2 (TD, WV, WS); run `roofweather roofnav roofsw` (Q's), back to the owner on failure.
4. Versions and generated files (§9.4 I): Weather 1.65 + NEWS in `weather/app.js` and `weather/roof/weather.js`; Today
   1.10 + NEWS; trim `connector.files` to the exact graph; `node .tools/minify.mjs`; `node .tools/wxshell.mjs`;
   `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public` and `node .tools/signin.mjs
   ../inflite/today/public` print no change; `suite.txt` adds `roofkit roofwxmount roofshell roofweather roofnav roofsw`
   after `todaymoments`; READMEs.
5. Checks: unit suite with IFL `claude/one-roof` beside (0 fail, 0 skipped) and with IFL `claude/inflite` beside (0
   fail; roof cases skipped with their reason) in `/home/user/up4/roof/wt/i-live/{georgefarrowgreen,inflite}`;
   `node --check` every changed file; `imports.test.mjs`; MAIN functions build; IFL dry runs (prod, `--env next`, and
   `email/`); full e2e suite twice through `e2e.sh` (two names), every test FAILS 0 (`ridetime` re-run once if flaky);
   the WebKit attempt of §10.4.
6. Go live, §11.1 in order (MAIN to `main`; staging with `inflite_ref = claude/one-roof` and the roof switch on
   next.inflite.ai; IFL to `claude/inflite` and the `…-dist7t` branch; the settled-version check; no other IFL branch
   push for a day), writing each check's result into `golive.md`, with §11.2's rollback to hand.

**Done when:** §11.1 steps 1–5 checked and recorded; the phone checks listed for George.
