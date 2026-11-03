# One roof, stage 2: briefs for each batch

One brief per batch. Each is meant to be followed with `s2/spec.md` (beside this file), `roof/addendum.md` (which
wins over both), stage 1's `roof/spec.md` (its contracts hold unless a stage-2 CONTRACT CHANGE says otherwise) and the
code files it names. Section numbers (§), decisions (S2-D) and contract changes (C1–C10) are `s2/spec.md`'s; D-numbers
without S2 are stage 1's. Read "Every batch" first, then your own brief.

- MAIN = the `georgefarrowgreen` repo (Cloudflare Pages: Chat, Weather, Fitness, Markets, the account page, server code
  in `functions/`). IFL = the `inflite` repo (the Worker at `inflite.ai`: Today in `today/`, Mail in `email/`).
- ROOF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof` (spec, addendum, maps; stage
  2's files in `ROOF/s2/`). TF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf`
  (`e2e.sh`, `i0-wfsim.py`, results under `state-<name>/`).
- The repos are `/home/user/up4/tf/georgefarrowgreen` and `/home/user/up4/tf/inflite`. The integration branch is
  `claude/one-roof-s2` in both, made by the integrator from `claude/one-roof` once stage 1 is live, and checked out at
  `/home/user/up4/roof2/int/{georgefarrowgreen,inflite}`. **Batches never edit the integration checkouts**: only the
  integrator merges into them.
- Stage 4 (Mail) is built at the same time on its own branches. **S2-B0 is the joint R0 of stages 2 and 4** (S2-D20):
  its `router.js` and `ROOF/s2/contracts.md` are what both stages build on.

| id | Batch | Wave | Starts after | Deep review |
|---|---|---|---|---|
| `b0` | B0 · Contracts (joint R0 with stage 4) | 0 | – | – |
| `fw` | FW · Framework and host | 1 | B0 merged | yes |
| `sv` | SV · Server, root worker, switches | 1 | B0 merged | yes |
| `wx` | WX · Weather on open | 1 | B0 merged | – |
| `mk` | MK · Markets module | 1 | B0 merged | Send and search |
| `fxa` | FXA · Fitness core and Today | 1 | B0 merged | – |
| `fxb` | FXB · Fitness sheets | 1 | B0 merged (its kit run after FXA merges) | – |
| `q` | Q · Acceptance tests | 1 | B0 merged (its real runs at I) | – |
| `i` | I · Integration | 2 | run by the integrator, merging each batch as it goes green | – |

---

## Every batch

### Set up

Every batch, B0 included, makes its own pair of worktrees side by side (MAIN's tests look for IFL at `../inflite`), on
`roof2/<id>` off `claude/one-roof-s2`:

```sh
B=mk                                   # your batch id: b0 fw sv wx mk fxa fxb q
W=/home/user/up4/roof2/wt/$B
ROOF=/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof
TF=/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf
mkdir -p $W
git -C /home/user/up4/tf/georgefarrowgreen worktree add $W/georgefarrowgreen -b roof2/$B claude/one-roof-s2
git -C /home/user/up4/tf/inflite          worktree add $W/inflite          -b roof2/$B claude/one-roof-s2
ln -s /home/user/up4/tf/georgefarrowgreen/.tools/tests/node_modules $W/georgefarrowgreen/.tools/tests/node_modules
ln -s /home/user/up4/tf/inflite/node_modules                        $W/inflite/node_modules
ln -s /home/user/up4/instant/inflite/email/node_modules             $W/inflite/email/node_modules
cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs   # baseline: note pass/fail/skipped
```

If the worktrees already exist (a fix round), `cd` into them and carry on. To pick up batches already merged:
`git -C $W/georgefarrowgreen merge claude/one-roof-s2` (and the same in `$W/inflite`). Do that before any test your brief
says needs another batch.

### Run things

- While you work, only the unit tests that cover your files: `node --test .tools/tests/unit/<name>.test.mjs` (always
  include `roofcontract` and `roofbudget` if you touched a module file).
- Once, on your final commit: the whole unit suite, `cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs`.
- Parse check: `node --check <file>` for every `.js`/`.mjs` you changed.
- Module loading (anything a server imports): `node .tools/tests/unit/imports.test.mjs`.
- IFL Worker dry run (any IFL change): `cd $W/inflite && npx wrangler deploy --dry-run --outdir $ROOF/s2/dry-$B`
  (SV also `--env next`).
- **End-to-end tests, only through the isolated runner, only the tests your brief names:**
  `$TF/e2e.sh $W/georgefarrowgreen <name> <test> [<test>…]` with `<name>` = `s2-<id>`, or `s2-<id>-<n>` to keep an
  earlier run's results (each run wipes `$TF/state-<name>/`). Results: `$TF/state-<name>/results.log` ("FAILS 0" is a
  pass; a test that prints `SKIPPED` is **not** a pass). Logs `$TF/state-<name>/<test>.log`, screenshots
  `$TF/state-<name>/out/<test>/`. At most two runs machine-wide (the runner waits for a slot; stage 4's batches share
  them); put all your tests in one call. Module batches use the kit page only; hub tests are Q's and I's.
- e2e tests select DOM only through `.tools/tests/roofhooks.mjs`. A hook you need that isn't there: report it to the
  integrator (who adds it), don't invent a selector into another batch's markup.

### Rules

1. **Edit only the files your brief says you own** (spec §8.2 is the full table). If you need a change in someone
   else's file, stop and report it in your hand-off (`needsFromOthers`); don't make it.
2. **The names other batches use are fixed** by B0 (❄ in §8.2; every export in §3, §4.7 and `ROOF/s2/contracts.md`).
   Keep them; add, don't rename. A stub you replace keeps every export and drops `STUB`.
3. **Never** push; never bump a version (`BUILD`, `NEWS`, `APP_VERSION`, `APP_NEWS`); never run
   `node .tools/minify.mjs`, `node .tools/wxshell.mjs` or `node .tools/iflmenu.mjs` (nor `signin.mjs`); never edit
   `.tools/tests/suite.txt`. Integration does all of that.
4. **Never touch stage 4's files**: `email/**`, `today/public/mailhost.js`, `mailframe`/`mailhost`/`hubmail` tests,
   `.tools/inflite/menu.js|css`. Mail-only lines in shared files (its CSP origin, its notice step, `NAMES`, `APP_KEPT`)
   are stage 4's.
5. Until integration, `min.test.mjs` and `wxshell.test.mjs` may be red, and only for files you changed. Every other unit
   test must be green, in both IFL states: a MAIN unit case that needs stage 2 in the IFL beside skips with `roofSkip`
   from `unit/fixtures/roof.mjs` and says why; a case you rewrite keeps its stage-1 assertion for the other state.
6. **Privacy rule, always:** no message words, no Chat place names and no Markets amounts ever reach a server, a request
   URL or body, a push, `localStorage`/IndexedDB under `today:*`, or a log. Markets cards sent to friends carry name,
   sym, pct and day only; Today's own Markets card and Markets' own screens may show pounds (R2). Chat stays end-to-end
   encrypted. Search is on device only (D16), except the "Find … in Markets" entry when tapped (§2.5). Every string
   from data goes through `textContent` or `esc()`. No inline styles or inline handlers.
7. **Hub mode keys on the server's marker** (`IFL.hub.on`), never on the hostname. Markets and Fitness at their own
   addresses (finance.inflite.ai, fitness.inflite.ai) behave exactly as today: their `app.js` is not edited by anyone
   but I (`BUILD`/`NEWS`).
8. Words on screen: London, UK English, plain words, title case on buttons as the apps already do ("Add a Stock",
   "Add Files", "Fitness Settings", "Try Again").
9. **No model names or model IDs** anywhere: not in commits, code, comments, logs or test names.
10. Commit on `roof2/<id>` in each repo you changed: small commits with plain messages, each ending with exactly these
    two lines:
    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_014XnqoGQHbED3n4J5zbYg9i
    ```
11. Work fast (addendum R1): build what your brief and the spec ask, prove it with the checks named, nothing more. Port,
    don't redesign (S2-D1): keep app.js's names, move code through the adapters, keep the apps' CSS re-tokenised.
12. Append a short log to `$ROOF/s2/<id>-log.md` (what you built, decisions, commands and their counts, what's left).
    When done, report: what you built, the test commands and results (unit pass/fail/skipped counts, each e2e
    `FAILS n`), the commits, anything not done and why, and anything you need from another batch.

### What "Done when" means

Every item proven by a command you ran in your own worktrees on your final commit, with the counts in your report:
"FAILS 0" for each e2e test named; unit suite 0 failing (skips only with their stated reason); `node --check` clean;
dry run ok where IFL changed; `roofbudget` within §4.6 for any module you touched.

---

## B0 · Contracts (joint R0 with stage 4; serial, alone, small)

**Goal.** Make every name, file, hook, table and test helper more than one batch uses (in stage 2 and in stage 4), so
all seven wave-1 batches and stage 4's batches start at once and no one edits another's file. Nothing user-visible
changes.

**Read first:** spec §0, §1 (S2-D2, D9, D18, D20, D21), §3 (all), §4 (all, especially §4.7), §7, §8.2, §9.1 B0 rows;
`s4/spec.md` §5 (C1–C6) and §11; stage 1's `spec.md` §3.3, §3.14, §5; IFL `today/public/roof/router.js`; MAIN
`.tools/tests/roofhooks.mjs`, `unit/roofrouter.test.mjs`, `unit/roofcontract.test.mjs`, `unit/fixtures/roof.mjs`,
`roofkit/serve.mjs`, `roofkit/index.html`, `roofkit/kit.js`, `.tools/minify.mjs` (its esbuild options),
`fitness/app.js:2806-2813`, `fitness/today.js:1-12`, `markets/app.js:790-1240`; `ROOF/s2/tools/graph.mjs` (static-graph
gzip walker, reuse it).

**Owns** (❄ = frozen for everyone after you):
- IFL: `today/public/roof/router.js` ❄ (complete).
- MAIN: `.tools/tests/roofhooks.mjs` ❄ (gain only); `unit/roofrouter.test.mjs` ❄; `unit/roofcontract.test.mjs` ❄;
  `unit/roofbudget.test.mjs` ❄ (new); `unit/fixtures/roof.mjs`; `unit/fixtures/budget.mjs` (new);
  `.tools/tests/roofkit/serve.mjs`, `roofkit/index.html`, `roofkit/kit.js`; `rooflib.mjs` (per-app helpers only, then
  Q's); stubs → owners per §8.2: every file of §4.2 (`markets/roof/*` → MK), §4.3 (`fitness/roof/*` → FXA/FXB by the
  Owner column), `weather/roof/wxwarn.js`, `wxdetail.js` (→ WX).
- `ROOF/s2/contracts.md` (new).

**Must not touch:** `frame.js`, `modules.js`, `connectors.js`, `app.js` (FW); `roof.js`, `hub.js`, `sw.js` (SV);
existing `weather/roof/*` files (WX); any app's `app.js`; anything of stage 4's beyond the `mail` REGISTRY entry.

**Steps:**
1. `router.js`: C1 (wider arg after one `decodeURIComponent`) and C2 (REGISTRY `markets`, `fitness` as §3 writes them;
   `mail` exactly as `s4/spec.md` §5 C2; optional `own`, `stay`, `idb`; `parse`/`owns` taking `false`, `true` or a map).
   Still pure: no DOM, no storage.
2. `ROOF/s2/contracts.md`: one page, the frozen shapes both stages build to: `roofOn(env, app)` and `appsOn(env)`
   (C3), `/api/hub` `{ ready, roof, apps }`, `sessionStorage["ifl-roof-apps"]` JSON, `F.session.apps`,
   `F.setRoof(v, apps)`, `links[R.own || app]`, `stay`, `fw.header.set({ sections: false })`, `fw.nav.go(path,
   { replace })` (C9), `connector.lazy` and `NET` (C4), `connector.search(q, { userId })` and `connectorProvider` (C6),
   C7's reload rules, `fw.changed()` (C8), the `roof.yml` table of §7 (with stage 4's `mail` and stage 3's `chats` rows),
   `hubstack.mjs`'s generic `roof-<app>` flag, the budgets of §4.6. Ask stage 4's lead to sign it (a line at the
   end with their batch id and date) before you report done.
3. Stubs: every new module file with its final exports (§4.2, §4.3, §4.7), contract comments, `STUB = true`, functions
   that throw `new Error("not yet: <name>")`. Entries `markets.js`/`fitness.js` with `CONTRACT = 1`, `BUILD`/`NEWS` =
   each `app.js`'s current values, `SECTIONS` ❄, `mount` returning a placeholder instance with every method.
   `connector.js` in final shape (`shares` words ❄ as §4.2/§4.3, `sections`, `aliases`, `files` = the stubs' static graph
   + css, `lazy`, `mini` copied from `connectors.js:26`/`:29-32`, minimal `search`). `core.js` with `S` shape ❄ and
   `EVENTS` ❄. Each stub statically imports the reused files its real version will use (so the graph and the budget are
   the agreed ones), and every dynamic import sits in `fw.lazy(() => import("…"))` with a literal. `fitness/roof/x.js`
   complete. Empty CSS files (`markets.css`, `fitness.css`, `fxviews.css`). `weather/roof/wxwarn.js` and `wxdetail.js`
   stubs with the names §4.5 moves (WX fills them).
4. `roofhooks.mjs` gains, one constant per hook with its owner in a comment:
   - `M_MARKETS = 'main#m-markets'`, `M_FITNESS = 'main#m-fitness'` (FW makes them; also the Fitness drop target,
     `FX_DROP = M_FITNESS`).
   - MK: `MK_SEC = 'section.mk-sec[data-sec]'`, `mkSec(id)`; `mkRow(sym)` = `.m-markets [data-k=holding][data-sym="<sym>"]`;
     `MK_EDIT = '.m-markets [data-k=edit]'`; `mkMove(sym, dir)` = `.m-markets [data-k="move-<up|down>"][data-sym="<sym>"]`;
     `MK_HERO = '.m-markets [data-k=portfolio]'`; `MK_PORTFOLIO_SEND = MK_HERO + ' [data-act=send]'`;
     `MK_STOCK_SEND = 'dialog.ifl-sheet[data-sheet=stock] [data-act=send]'`; `MK_STOCK_REMOVE = … [data-k=remove]`;
     `MK_ALERT = 'dialog.ifl-sheet[data-sheet=stock] input[data-k=alert]'`; `MK_ADD_INPUT =
     'dialog.ifl-sheet[data-sheet=add-stock] input[data-k=find]'`; `MK_ADD_RESULT = … [data-k=result][data-sym]`;
     `MK_ABOUT = '.m-markets [data-k=about]'`; `mkStory(id)` = `.m-markets [data-k=story][data-id="<id>"]`;
     `MK_ACCOUNT_ROW = '.m-markets [data-k=account]'`.
   - FXA: `FX_SEC`, `fxSec(id)` (`section.fx-sec`); `fxDay(day)` = `.m-fitness [data-k=day][data-day="<YYYY-MM-DD>"]`;
     `FX_GRID_DAY = '.m-fitness .gday[draggable]'`; `FX_DAYCARD = '.m-fitness [data-k=daycard]'`; `FX_FILES =
     '.m-fitness input[type=file][data-k=files]'`; `fxOffer(id, act)` = `.m-fitness [data-offer="<id>"] [data-k="<keep|undo>"]`;
     `FX_SESSION_SEND = FX_DAYCARD + ' [data-act=send]'`.
   - FXB: `fxAct(id)` = `.m-fitness [data-k=act][data-id="<id>"]`; `fxSettingsPage(id)` =
     `dialog.ifl-sheet[data-sheet=fxsettings] [data-page="<id>"]`; `FX_STRAVA = '… [data-sheet=fxsettings] a[data-k=strava]'`;
     `FX_ACT_MAP`, `FX_ACT_SHARE` (`[data-k=map]`, `[data-k=share]` in the `act` sheet).
   - Header acts: `hdAct("plus")` Markets' Add a Stock; `hdAct("upload")` Add Files; `hdAct("settings")` Fitness
     Settings (stage 1's `HD_SETTINGS`).
   - Today/Apps (TD's markup, unchanged): `TODAY_MK_CARD`, `TODAY_MK_OPEN`, `TODAY_FX_CARD`, `TODAY_FX_OPEN` as stage 1's
     `TODAY_WX_*` with `data-app="markets"|"fitness"`; You's Evening Wrap switch `YOU_MK_WRAP =
     '#youNotify [data-app=markets] [data-k=wrap]'` (FW).
5. `roofkit/serve.mjs`, `index.html`, `kit.js`: serve any REGISTRY app's `/<app>/roof/*` and `/<app>/*` from MAIN when
   the page asks for the real module (`?module=/<app>/roof/<app>.js`), `/<app>/version` per app, and a session with
   `apps` (`?apps=weather,markets`); the fake module stays the default for Weather's path. `roofkit.mjs` and
   `roofwxmount.mjs` must pass unchanged.
6. `rooflib.mjs`: `meter(p, app)`, `connectorFiles(app)`, `moduleBuild(app)` generalised from Weather's.
7. Tests:
   - `roofrouter`: §9.1 B0 row.
   - `roofcontract`: generalised to every REGISTRY module present on disk (Weather's cases unchanged), with C4's exact
     `lazy` rule and the `NET` table, C5's greps, literals in `fw.lazy`, `/weather/vendor/` only from NET files, and
     "still B0's stub" skips for behaviour cases of files that export `STUB`.
   - `unit/fixtures/budget.mjs`: `staticGz(app)` = walk the entry's static graph, minify each file with `minify.mjs`'s
     esbuild options in memory, gzip -9, sum JS and CSS separately (KiB).
   - `roofbudget`: §4.6's limits per module; on the stubs, Markets' and Fitness's figures are the reused files only:
     print them in your log (RI12: the measured floor before anyone ports).

**Done when:** unit suite green (with your new cases; also once with IFL's `router.js` moved aside, to see the roof
cases skip cleanly, then restored); `node --check` on every file; IFL dry run ok; e2e `roofkit roofwxmount` FAILS 0
(nothing changed for Weather); `contracts.md` signed by stage 4's lead; `roofbudget`'s printed floor for Markets and
Fitness in your log.

---

## FW · Framework and host (wave 1; deep review)

**Goal.** The framework and Today's page take per-app switches, never lose work to a reload, keep Places in Search,
refresh Today's cards after in-page changes, clear every app's data on any confirmed sign-out, and carry stage 4's two
frame asks, proven on the kit page and in `roofshell`.

**Read first:** spec S2-D2, D10, D11, D14, D17, D20, D21, §3 (C2, C3, C4, C6, C7, C8, C9), §5.1, §5.2, §9.1 `roofpage`,
§9.2 `roofkit`; `ROOF/s2/contracts.md`; IFL `today/public/roof/frame.js`, `modules.js`, `connectors.js`,
`today/public/app.js` (`heard` `:864`, `askHub`, `hubReady`, `applyHub` `:913`, `retireWeather` `:921`, `bootGone`
`:950`, `preloadWeather` `:975`, `forgetApps` `:1067`, `signOut` `:1127`, `signedOutNow` `:1166`, screens `:1244`),
`you.js:111-116`; `ROOF/integrate-todo.md` (stage 1's FW/TD notes).

**Owns:** IFL `today/public/roof/frame.js`, `modules.js`, `connectors.js`; `today/public/app.js` (only the functions
named here; not the shared block between the iflmenu marks, not `BUILD`/`NEWS`, not stage 4's `NAMES`/`APP_KEPT` lines);
`today/public/you.js`. MAIN `unit/roofpage.test.mjs`, `.tools/tests/roofshell.mjs`, `.tools/tests/roofkit.mjs`,
`roofkit/fake-module.js`, `roofkit/fake-connector.js`.

**Must not touch:** `router.js`, `roofkit/serve.mjs|index.html|kit.js` (B0), `sw.js`, `src/*` (SV), any module file,
stage 4's files.

**Steps:**
1. `frame.js`: `roofs()` per §5.1 and C3; `setRoof(v, apps)` (unmount only apps turned off; bounce only if shown, after
   `!F.busy()`, ≤ 10 s); C7 on every self-started stale reload (`:165`, `:242`, `:394`, `:457`); `fw.changed()` → 
   `opts.changed?.()` (C8); C9 (`sections: false`, `nav.go` `{ replace }`, `stay` in the tidy); search per C6
   (`fw.search.provide` replaces only that module's connector provider; `places()` becomes one connector provider per on
   app); hint only for Weather.
2. `modules.js`: refuse unless `s.hub && s.apps?.[app]`; `links[R.own || app]`; C4 keep rule (files after mount; `files
   ∪ lazy` only standalone, at idle, ≥ 10 s after first show); C7's version ask inside `fw.lazy` (≤ once a minute per
   app, at once on rejection; Try Again → reload when stale, else re-import with `?retry=<n>`).
3. `connectors.js`: `STATIC` keeps chats and mail; per-app fallback with `shares` and `mini` (RI13);
   `connectorOf(app, F)` asks a REGISTRY app's connector when `F.session.apps[app]`; `connectorProvider(F, app)` passing
   `{ userId: F.session.view?.user?.id }` to `search`; `openConnector`'s extra acts per app (§2.4).
4. `app.js`: `heard/askHub/hubReady` with `apps` and `ifl-roof-apps` (trust rule per boot app; bounce marker kept for
   an off boot app, RI4); `applyHub` → `F.setRoof(v, apps)`; `retireOld()`; `bootGone` per app with `own`;
   `preload(app)`; `signedOutNow()` → `forgetApps({ chat: false })` once confirmed, never offline (RB1); `opts.changed`
   and Today's `onShow` refetch when marked (RI3).
5. `you.js`: Markets row Evening Wrap switch (`PATCH /api/notify { markets: { wrap } }`, read from `n.markets.wrap`,
   hook `YOU_MK_WRAP`); Fitness row "Fitness Settings ›" → `/fitness/#settings`; Connected Apps acts per §2.4.
6. Fake module/connector: a `busy()` you can toggle, a second fake app entry for per-app cases, a connector `search`.

**Tests:** `roofpage` (§9.1 FW row); `roofkit` (§9.2 FW row: per-app `setRoof`, C9, C7 busy/idle/rejection, connector
providers); `roofshell` gains: `apps` from `/api/hub` stub (one off, one on), `signedOutNow` clears `markets:*` and the
`fitness` store, Today's cards refetched after `fw.changed()`.

**Done when:** unit suite green (with IFL `roof2/fw` beside, and with the roof absent: skips with reason);
`node --check`; IFL dry run ok; e2e `roofkit roofshell` FAILS 0; deep review by the integrator's reviewer passed.

---

## SV · Server, root worker, switches (wave 1; deep review)

**Goal.** The Worker serves each module only when its switch says so (opt-in for Markets and Fitness, opt-out for
Weather), retires the old hub workers, answers `/api/hub` with `apps`, keeps module files for offline per C4, and the
`roof.yml` switch works per app, proven by a test of `hub.sh` itself.

**Read first:** spec S2-D14, C3, C4, §5.3, §5.4, §6, §7, §9.1 SV rows; `ROOF/s2/contracts.md`; IFL `today/src/roof.js`,
`hub.js:96-142`, `today/public/sw.js` (`:74`, `:89-120`, `:95`, `:164-180`, `:246-303`); MAIN `markets/sw.js:48`, `:97`,
`fitness/sw.js:40`, `:101`, `.github/workflows/roof.yml`, `.github/hub/hub.sh:752-830`, `.tools/tests/hubstack.mjs`,
`hubserve.mjs`; `ROOF/golive.md` (stage 1's switch notes: no `--force`, the settled check); `TF/i0-wfsim.py`.

**Owns:** IFL `today/src/roof.js`, `today/src/hub.js`, `today/public/sw.js`. MAIN `.github/workflows/roof.yml`,
`.github/hub/hub.sh`, `.tools/tests/hubstack.mjs`, `hubserve.mjs`, `unit/roofswitch.test.mjs` (new),
`unit/roofserve.test.mjs`, `hubworker.test.mjs`, `hubheaders.test.mjs`, `rootsw.test.mjs`, `todaysw.test.mjs`,
`todayworker.test.mjs`, `todayfiles.test.mjs`.

**Must not touch:** `today/public/app.js`, `roof/*` (FW, B0), `_headers` (no CSP change in stage 2; stage 4 owns its
origin there), any MAIN app or `functions/` file.

**Steps:**
1. `roof.js`: `MODS`, `roofOn(env, app)`, `appsOn(env)` (C3 exactly); `modOf`; `ROOF_FILES` per app; `RETIRE_SW(app)`
   with each app's cache prefix and path; `retireWorker(request, app)`.
2. `hub.js`: `/api/hub` → `{ ready, roof, apps }`; per app on → framework page, retiring `sw.js`, 301 for the bare path;
   off → hub page as today and 404 no-store for its roof files.
3. `sw.js`: `SHELL = "today-app-4"`; one `MODS` list for `ROOF_DOCS`, `FRAMEWORK`, `KEEP_APPS`; `moduleFile`/
   `fromModule` per app; `keep` validates `files ∪ lazy` per app (same-origin, under the app's paths, never vendor or a
   NET file, ≤ 60); `openIn` per framework window with the "told to open" fallback.
4. `hub.sh`: `roof_secret APP STATE` (the one table of §7), `roof_set W NAME put|delete` (existence check on the given
   name), `wait_roof SITE APP true|false [secs]`, `roof_verdict` naming the module; refusal for an app's `on` while
   `ROOF_OFF` is set. `roof.yml`: input `app` (`all | weather | markets | fitness`, default `all`), same concurrency
   group, settled check and `where` input.
5. `hubstack.mjs`: generic flags (`roof-<app>` → `ROOF_<APP>: "1"`, `roof-off-weather`, `roof-off`). `hubserve.mjs`:
   `/markets/` and `/fitness/` hub pages by default, framework with `roof-markets`/`roof-fitness`.

**Tests:** `roofswitch` (new: sources `hub.sh` with stub `wrangler`, `curl`, `jq` on `PATH`; every `app` × `state`:
secret name, put/delete, refusal, verdict words); the §9.1 SV rows, each rewritten case keeping its stage-1 assertion
under `roofSkip`.

**Done when:** unit suite green with IFL `roof2/sv` beside and with the roof absent (skips, no fails); `node --check`;
IFL dry run ok (prod and `--env next`); `bash -n .github/hub/hub.sh`; `i0-wfsim.py` dry runs for `app=markets
state=on|off` and `app=all state=off` (settled → set; not settled → refused, nothing changed); e2e `hubserve wxhub`
FAILS 0; deep review passed.

---

## WX · Weather on open (wave 1)

**Goal.** Weather's first open fetches none of 16 Days, Warnings, Places, Weather Settings and the detail and credits
sheets, and measures ≤ 90 KB gzip JS, with nothing on screen changed.

**Read first:** spec S2-D5, §2.3, C4, §4.5 (all of it: what moves and what must stay), §9.1/§9.2 WX rows; MAIN
`weather/roof/weather.js:29-35`, `now.js` (`:18`, `:24-25`, `:239`, `:395`), `warnings.js:19-62`, `wxui.js` (`:194-208`,
`:217-361`, `:372-554`), `connector.js`, `unit/roofwxviews.test.mjs:164-259`, `.tools/tests/roofwxmount.mjs`.

**Owns:** MAIN `weather/roof/weather.js`, `now.js`, `warnings.js`, `wxui.js`, `connector.js`, `wxwarn.js`, `wxdetail.js`;
`unit/roofwxviews.test.mjs`; `.tools/tests/roofwxmount.mjs`.

**Must not touch:** `core.js`, `sync.js`, `places.js`, `days.js`, `wxsettings.js`, `radarview.js` and Weather's CSS (no
change needed: they are loaded differently, not edited); standalone Weather; IFL.

**Steps:** §4.5 in order: `wxwarn.js` (static helpers; `warnings.js` re-exports them); `wxdetail.js` (lazy: detail,
credits, `ABOUT` and their private helpers; `wxui.js:217-253` stays); `now.js` through `ctx.open.detail/credits`, its
re-export dropped; `weather.js`'s lazy stub views and openers through `fw.lazy` with literals; `connector.files`/`lazy`
per C4. If `roofbudget` says over 90, report it before starting on `insights.js`.

**Tests:** `roofwxviews` (split; detail/credits words from `wxdetail.js` equal the old ones); `roofwxmount` gains: first
open fetches none of the lazy five, each fetched once when first opened, the settings part through lazy
`wxsettings.js`.

**Done when:** unit suite green (`roofbudget` Weather JS ≤ 90, CSS ≤ 14; `roofcontract`); `node --check`; e2e
`roofwxmount` FAILS 0. (`roofweather` part 8/14 are Q's, run at I.)

---

## MK · Markets module (wave 1; deep review of Send and search)

**Goal.** Markets as a module: Today, Holdings, News and every sheet of §2.1, ported from `markets/app.js` under its
own names through `mkui.js`, amounts never leaving the screen, proven on the kit page.

**Read first:** spec S2-D1–D7, D9, D18, D19, D21, D22, §2.1, §2.5, §2.6, §4.1, §4.2, §4.6, §4.7, §9 MK rows;
`map-markets.md`; MAIN `markets/app.js` (790–3115, the line refs in §4.2), `markets/send.js`, `charts.js`,
`stories.js`, `income.js`, `account.js`, `styles.css:1-707`, `mocks/marketsmock.mjs` (read only), `functions/_todaymkt.js:99`.

**Owns:** MAIN `markets/roof/*` (every file of §4.2); `unit/roofmkcore.test.mjs`, `unit/roofmkviews.test.mjs`,
`unit/fixtures/mk.mjs`; `mocks/mkroof.mjs` (new); `.tools/tests/roofmkmount.mjs` (new).

**Must not touch:** `markets/app.js` and every other standalone Markets file; `mocks/marketsmock.mjs`; IFL; any other
module.

**Steps:**
1. `core.js` (port under app.js's names; `S`, events, `store`, kept copy with id, `start/stop/shown/busy`, `live` per
   S2-D4, news whenever shown ≤ 15 min, 401 → `fw.session.lost()` and `stop()` on `true`, `fw.changed()` after writes).
2. `mkui.js` adapter, then move the views: `todayview.js`, `holdings.js`, `news.js`, `stock.js`, `edit.js`, `money.js`;
   the add-stock shell and field in `markets.js`, focused synchronously in the tap.
3. `markets.js` entry (header with `plus`, compactTitle in percent, badges, `show(route)`, provider while mounted with
   "Find … in Markets"), `connector.js` (`search(q, { userId })`).
4. Send (S2-D6): stock and portfolio cards and words; story Share words only. Hooks from `roofhooks.mjs` on every
   element they name.
5. `markets.css` re-tokenised (§4.2), two columns at ≥ 980 px with the desk row.

**Tests:** `roofmkcore`, `roofmkviews` (§9.1); `roofmkmount` (§9.2) against `mocks/mkroof.mjs`.

**Done when:** unit suite green (`roofbudget` Markets JS ≤ 40, CSS ≤ 12; `roofcontract` with no `STUB` left in
`markets/roof/`); `node --check`; e2e `roofmkmount` FAILS 0; screenshots at 320/390/1280 light and dark looked at, with
what you fixed in your log; deep review of Send and search passed.

---

## FXA · Fitness core and Today (wave 1)

**Goal.** Fitness's engine, adapters, Today (with offers on first paint) and file import as a module, under app.js's
own names, so FXB's sheets plug in unchanged.

**Read first:** spec S2-D1–D5, D9–D13, D18, D21, D22, §2.2, §2.6, §4.1, §4.3, §4.6, §4.7, §9 FXA rows; `map-fitness.md`;
MAIN `fitness/app.js` (817–1144, 2087–2189, 2508–2640, 2688–2702, 2806–2813), `fitness/today.js`, `invites.js`,
`plan.js` (`rhythmSaid :71`, `dayChanges :235`, `dayStamp :557`), `progressview.js:14`, `activities.js:357`, `ui.js`,
`styles.css`.

**Owns:** MAIN `fitness/roof/fitness.js`, `connector.js`, `core.js`, `idb.js`, `fxui.js`, `fxcalc.js`, `x.js`,
`todayview.js`, `offers.js`, `fitness.css`; `unit/rooffxcore.test.mjs`, `unit/fixtures/fx.mjs`; `mocks/fitnessmock.mjs`
(new); `.tools/tests/rooffxmount.mjs` (new).

**Must not touch:** FXB's files (`actsview.js progview.js planview.js fxsettings.js fxviews.css`), standalone Fitness,
IFL, any other module.

**Steps:**
1. `core.js` behind B0's frozen export list: the port, `start/stop` reset (RI7), `shown` with `newDay()` (RI2),
   `busy()` and flush on hide (S2-D21), `saveSettings(patch)`, `todaySnap` and `fw.changed()` after `A.today()`.
2. `idb.js` (C5, `close()`), `fxui.js` (adapter, widths from a `ResizeObserver` disconnected in unmount, `calendar`),
   `fxcalc.js` (parity with plan/progressview/activities).
3. `todayview.js` (port of `today.js`, `X` → `x.js`, openers → `ctx.open`), `offers.js` (static, `openOffer` without the
   document query).
4. `fitness.js`: header (`upload`, `settings`), file picker in the tap, drop per S2-D12 (Files only, document guard
   while shown), reader Worker in `fw.lazy` and terminated per batch, `show(route)` with the `openTo` rules, provider.
5. `connector.js`, `fitness.css` re-tokenised.

**Tests:** `rooffxcore` (§9.1); `rooffxmount` (§9.2) against `mocks/fitnessmock.mjs`.

**Done when:** unit suite green (`roofbudget` Fitness JS ≤ 85 — if over, take §4.6's fallbacks in order and say so —
CSS ≤ 22 with FXB's file as it stands; `roofcontract`); `node --check`; e2e `rooffxmount` FAILS 0; screenshots at
320/390/1280 light and dark looked at. Report as soon as `core.js`, `fxui.js` and `todayview.js` pass, so the integrator
merges you early for FXB's kit run.

---

## FXB · Fitness sheets (wave 1; its kit run after FXA merges)

**Goal.** Activities, Progress, the plan sheets and Fitness Settings, ported from `activities.js`, `progressview.js`,
`plan.js` and app.js's settings views onto `x.js`, with Strava opened from a real tap.

**Read first:** spec S2-D4, D7, D8, D13, §2.2, §4.3 (FXB rows), §4.7 (the `ctx.open` table), §9 FXB rows; MAIN
`fitness/activities.js`, `progressview.js`, `progress.js`, `plan.js`, `map.js`, `share.js`, `formats.js`, `fit.js`,
`app.js:1335-1428`, `:1841-2075`, `styles.css:352-443`, `:854-1066`; B0's stubs of `x.js`, `core.js`, `fxui.js`.

**Owns:** MAIN `fitness/roof/actsview.js`, `progview.js`, `planview.js`, `fxsettings.js`, `fxviews.css`;
`unit/rooffxviews.test.mjs`; `.tools/tests/rooffxsheets.mjs` (new).

**Must not touch:** FXA's files (if `x.js` lacks a name you need, report it: FXA adds it), standalone Fitness, IFL.

**Steps:** port each file through `x.js` (only `from "./app.js"` → `from "./x.js"` and the openers → `ctx.open` where
possible); `actsview.js` with `act-map`, `act-share`, the route map destroyed on close, `older()`/`routes()` stopping
when hidden; `planview.js` with `download()` on a blob; `fxsettings.js` with only-the-keys saves and Strava per S2-D13;
`fxviews.css` re-tokenised. Write `rooffxsheets.mjs` against the frozen hooks while FXA works.

**Tests:** `rooffxviews` (§9.1); `rooffxsheets` (§9.2).

**Done when:** unit suite green (`roofcontract`; `rooffxviews` runs on your files with FXA's stubs); `node --check`;
then, after FXA is merged into `claude/one-roof-s2` and into your branch: e2e `rooffxsheets` FAILS 0 and `roofbudget`
Fitness CSS ≤ 22.

---

## Q · Acceptance tests (wave 1; real runs at I)

**Goal.** The hub-stack tests that prove stage 2 end to end, written against the spec and the frozen hooks before the
code exists, run once at integration.

**Read first:** the whole spec, especially §2, C3, C6, C7, C8, §6, §7, §9.2 Q rows, §9.3; MAIN `.tools/tests/lib.mjs`,
`rooflib.mjs`, `roofhooks.mjs` (B0's), `roofweather.mjs`, `roofnav.mjs`, `roofsw.mjs`, `mkthub.mjs`, `ridetime.mjs`,
`hubstack.mjs`, `run.sh`; `ROOF/golive.md` (stage 1's after-live list).

**Owns:** MAIN `.tools/tests/roofmarkets.mjs`, `rooffitness.mjs` (new), `rooflib.mjs` (after B0), and the changes to
`roofweather.mjs` (part 8 at 90, parts 14 and 14b), `roofnav.mjs`, `roofsw.mjs`; any §9.3 triage edit.

**Must not touch:** `lib.mjs`, `run.sh`, `hubstack.mjs`, `hubserve.mjs` (SV), any test another batch owns, any app code.

**Steps:** `roofmarkets.mjs` (`// needs: hub roof-markets`) and `rooffitness.mjs` (`// needs: hub roof-fitness`) step by
step as §9.2, each log line naming the spec section it proves; `roofweather` part 8 → `JS_MOST = 90`, part 14, part 14b
(changed `wxui.js` export deployed mid-session in the stand-in); `roofnav`/`roofsw` first line `// needs: hub
roof-markets roof-fitness` and their new cases; selectors only from `roofhooks.mjs`; third-party and API stand-ins in
`rooflib.mjs`. Dry-run what can run against B0's stubs (expect the skip lines, not crashes).

**Done when:** each file passes `node --check`; a scratch merge of every batch that has reported done, run once through
`e2e.sh` with your tests, is in your log with each failure assigned to its owner (a failure that is another batch's bug
is reported with the step and log, not changed to fit). The passing runs are I's.

---

## I · Integration (run by the integrator)

**Goal.** Merge every batch into `claude/one-roof-s2` as it goes green, make the shared changes, prove the whole, and go
live dark, then switch each module on (§11).

**Owns:** `.tools/tests/suite.txt`, `.tools/tests/README.md`, IFL `README.md`, `min/**`, `weather/sw.js`'s
`SUMS`/`CACHE` lines and `weather/index.html`'s version mark (by `wxshell.mjs`), every `BUILD`/`NEWS` (Weather in
`weather/app.js` and `weather/roof/weather.js`; Markets in `markets/app.js` and `markets/roof/markets.js`; Fitness in
`fitness/app.js` and `fitness/roof/fitness.js`; Today in IFL `app.js`), hooks asked for after B0, `ROOF/s2/golive.md`.

**Must not touch:** batch-owned code beyond those lines. A behaviour conflict goes back to its owner.

**Steps:**
1. Make `claude/one-roof-s2` from `claude/one-roof` in both repos (once stage 1 is live) and the checkouts at
   `/home/user/up4/roof2/int/`. Merge B0 (`git merge --no-ff roof2/b0`); unit suite. Tell all seven wave-1 batches and
   stage 4's lead to start.
2. Merge wave 1 as each goes green, FXA early (as soon as it reports core and Today pass) so FXB can run its kit test;
   after each merge tell running batches they may merge `claude/one-roof-s2`. Arrange the deep reviews for FW, SV and
   MK's Send and search.
3. When stage 4 needs the shared framework code for its hub runs, tell its integrator which merge commits of B0, FW
   and SV to take.
4. Versions and generated files: Weather 1.66, Markets 1.96, Fitness 1.68, Today 1.11 (+0.01 again if stage 4's IFL
   release went first), each with S2-D16's `NEWS`, in the same commit as `node .tools/minify.mjs` then
   `node .tools/wxshell.mjs`; `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public` and
   `node .tools/signin.mjs ../inflite/today/public` print no change; `suite.txt` adds `roofmkmount rooffxmount
   rooffxsheets roofmarkets rooffitness` after `roofsw`; READMEs.
5. Checks (§9.4): unit suite with IFL `claude/one-roof-s2` beside (0 fail, 0 skipped) and with IFL `claude/inflite`
   beside (0 fail; roof cases skipped with reason) in `/home/user/up4/roof2/wt/i-live/{georgefarrowgreen,inflite}`;
   `node --check` every changed file; `imports.test.mjs`; IFL dry runs (prod, `--env next`); e2e `wxapp wxacct` (Weather's
   standalone after wxshell); full e2e suite twice, each pass split in halves over the extra cloud sessions (R3), every
   test FAILS 0.
6. Go live, §11.1 in order, writing each check into `ROOF/s2/golive.md`: MAIN to `main` (then no MAIN push touching
   `weather/roof/*` until step 3 is live); IFL dark to `claude/inflite` and the `…-dist7t` branch the same day; staging
   (`hub-stage.yml`, `roof.yml app=markets|fitness state=on`, then off and on, `where=next.inflite.ai`); production
   `roof.yml app=markets state=on where=inflite.ai`, its checks, then fitness; no other IFL branch push for a day after
   the IFL release. Keep §11.2's rollback to hand.

**Done when:** §11.1 steps 1–6 checked and recorded; the phone checks listed for George; stage 3's lead told that its
switch and `apps` follow `ROOF/s2/contracts.md`.
