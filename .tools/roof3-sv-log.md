# One roof stage 3, batch SV: server, root worker, switch, MAIN serving

Branch `r3/sv` in both repos (from `claude/one-roof-24`, with `origin/r3/b0` and the latest `claude/one-roof-24`
merged in). The switch follows s24-contracts (opt-in): **`ROOF_CHATS="1"` turns Chats on; if it's absent, `"0"` or anything else, Chats is off**,
and `ROOF_OFF="1"` still turns everything off. The s3 spec's `ROOF_OFF_CHATS` is not used anywhere.

## What I built

**IFL**
- `today/src/roof.js`
  - `MODS` gains `chats`, so `roofOn(env, "chats")` and `appsOn().chats` follow `ROOF_CHATS`.
  - `modOf(path, search = "")` returns `chats` only for `/chats/` or `/chats/index.html` with no `engine` in the query, and never for `/chats/in/`.
  - `retireSw("chats")`:
    1. deletes the `inflight-shell*` caches;
    2. unregisters;
    3. posts `{ifl:"route", url: <the window's own path>}` (with a MessageChannel) to each top-level window at exactly `/chats/` or `/chats/index.html` (never an engine at `?engine`, a framed window, or `/chats/in/`);
    4. navigates only a window that doesn't answer `{ifl:"routed"}` within 1 s.
  - Weather's `RETIRE_SW` is byte for byte unchanged (tested).
  - `PAGE_HEADERS`: CSP gains `media-src 'self' blob:`. Permissions-Policy is now `camera=(self), microphone=(self), geolocation=(self)`. No `wasm-unsafe-eval`.
- `today/src/hub.js` (one block):
  - **Chats on:** `/chats/` is `roofPage`, before the key check, as Weather's is. `/chats/sw.js` is `retireWorker(request, "chats")`.
  - **On or off:** `?engine`, `/chats/in/*`, `/chats/roof/*` (when on) and every other Chat file are forwarded to `/_hub/…` as before. `/chats` (no slash) keeps the hub's existing 301 behind the key, unchanged.
  - **Chats off:** `/chats/roof/*`, however it's written (`%72oof`, `//roof`, `x/..%2Froof`), is a 404 with `no-store`, and Chat is never asked.
- `today/public/_headers`: `/*` has the same CSP and Permissions-Policy as `PAGE_HEADERS` (test-compared).
- `today/public/sw.js` (root worker):
  - `MODS.chats = { name: "Chats", host: "chat" }`.
  - `engineAt(u)`: a `/chats/` URL with `engine` is never `roofDoc` and never a framework window (`frameAt` in `openIn`). `/chats/in/` is not in `ROOF_DOCS`.
  - Keep rule for `chats`: only `/chats/roof/…` and `/chats/<name>.(js|css)`. Never `sw.js`, `version`, `in/`, `tracker*`, `handover*`, `index.html`, `map/`, or `.svg`.
  - `moduleFile` for chats: the same paths, plain or with a query of exactly `?v=<12 lowercase hex>`. The kept copy is matched by pathname (`fromModule` already did). Network first; a 404 is passed on.
  - Chat's pushes still say `app: "chat"`; push, pulse and badge are unchanged. The unused `pathOf` was removed.

**MAIN**
- `functions/_app.js` `stampImports`: files under `/pigeon/roof/` only (`stampRoof`) also get stamps for `"../x.js"` (and `"./x.js"`, `import("…" + q)`) and for `new URL("./x.js", import.meta.url)`.
  - Each address is resolved as the browser would. Only Chat's own files are stamped: never a path outside `/pigeon/`, never the file itself.
  - An import cycle is left unstamped at the point where it closes, instead of hanging the request. The old code would deadlock on any cycle; non-roof files have none.
  - Every other file goes through exactly the old code path.
- `functions/_middleware.js`: `/_hub/in/<x>` is served as `/_hub/<x>`. So `/_hub/in/` and `/_hub/in/index.html` are Chat's page, and `inflite.svg` and `version` under it are the hub copy's.
- `pigeon/app.js`, the `/pigeon/in/` block: `IN_PAGE`/`IN_AT` are top-level, written as `"/pigeon/in/"` so `atRoot` turns it into `/chats/in/` at the hub. Three behaviours:
  - (a) No worker is registered. The guard is added after engine.test's pinned `!ENGINE && "serviceWorker" in navigator`.
  - (b) In `signInBack`, if there is no `then`, `location.replace("/pigeon/")`, which is `/chats/` at the hub.
  - (c) In `start()`'s signed-in branch, before anything is drawn: if no sign-in is under way and the hash isn't `#signin…`, `#verify=`, `#invite=`, `#reset=` or `#account`, go `location.replace("/pigeon/" + hash)`.
- `.github/workflows/roof.yml` (`app: chats`, its check, a header note) and `.github/hub/hub.sh` (`ROOF_APPS` += chats). j0 had already wired `roof_secret`, `roof_set` and `roof_name` for chats. The verdict reads "Chats is back to its own page at /chats/, its module's files not found".
- `.tools/tests/hubstack.mjs`: `roof-chats` (generic: `ROOF_CHATS "1"`). `roof-off-chats` sets `ROOF_CHATS "0"`, the same as the default, but stated outright.

**Tests** (each rewritten case keeps its earlier assertion under its own skip, "before stage 3"):
- `hubworker` (+1 case): Chats on and off, with and without the key, `?engine`, `/chats/in/`, files, 301, 404 however written; Weather and Markets are independent of it.
- `roofserve` (+2): `roofOn`/`modOf` for chats; the retiring worker run in a VM (route-first, 1 s, never `/chats/in/`, an engine or a framed window).
- `rootsw` (+1), `todaysw` (+1): Chats' document, keep list, `?v=` files and the kept copy.
- `todayfiles`, `hubheaders` (+1): IFL `hub.js` with MAIN's middleware in-process, `/chats/in/` on and off.
- `roofchatserve` (new, 6 cases):
  - every Chat file outside `/roof/` is byte for byte what `_app.js@6542024` sent, at all three addresses;
  - roof stamping with each stamp kept for good;
  - B0's real `pigeon/roof/*` stamped (service.js's `core.js` is stamped and immutable);
  - `/_hub/in/`;
  - the three `/pigeon/in/` behaviours.
- `hubserve` (+6 checks, Chats off as default): `/chats/roof/*` 404 `no-store`; `/chats/in/` is Chat's page; `inflite.svg`, `version`, `?engine` and `sw.js` are Chat's own.

## Results (final commit)
- **Unit, IFL `r3/sv` beside:** 1338 tests, 1329 pass, 7 skipped (all from stages 1 and 2), **2 fail**:
  - `min.test`: expected, because minified copies go stale for changed files (`pigeon/app.js`, B0's stubs, stage 2's fitness files).
  - `appstamp` "a page asks the store for each of its files once": a knock-on of the stale `min/pigeon/app.js`, since `functions/_min.js` reads both copies. I proved it: with `pigeon/app.js` reverted it passes 2/2. It goes green when I runs `minify.mjs`.
- **Unit, IFL `claude/one-roof-24` beside (no stage 3):** 1302 tests, 1287 pass, 13 skipped (every stage-3 case, with "before stage 3"), the same 2 fails.
- **e2e `./run.sh hubserve chats`:** hubserve FAILS 0, chats FAILS 0 (standalone Chat unchanged). Run before the last merge and again on the merged tip: FAILS 0 both times.
- **Checks:**
  - `node --check` on every changed file: clean.
  - `imports.test` is green (it's in the suite).
  - `bash -n .github/hub/hub.sh`: ok.
  - IFL `wrangler deploy --dry-run`, prod and `--env next`: ok.
- **Workflow dry runs:** `i0-wfsim.py` isn't reachable from this session, so I used a stand-in. It runs `roof.yml`'s real steps in bash with the real `hub.sh`, faking only Cloudflare's API, wrangler and `/api/hub`. Result: 10/10.
  - chats on, settled: `ROOF_CHATS=1` on staging, then live; `/api/hub` agrees.
  - chats off: `0` on both.
  - chats on, inflite.ai alone.
  - Not settled, on or off: refused at the settled step, nothing changed.
  - Chats on under `ROOF_OFF`: refused at the allowed step, nothing changed.
  - Chats off under `ROOF_OFF`: allowed.
  - `all off`: `ROOF_OFF=1`, with Chats' own switch left alone.
  - `markets off`: Chats untouched.
  - A bad app name is refused at the first step.
  - The harness is in this session's scratchpad (`wf/`); it isn't committed because it isn't mine to add.

## Open issues
1. **With the switch off, some behaviour is not quite as live** (the root worker can't know the switch; j0 made the same choice for Markets, Fitness and Mail):
   - (a) Tapping a Chat notification while a milestone-1 Chats window at `/chats/` is open first asks that window to route. It gets no answer, and after 1 s is told to open, as before. That is up to 1 s slower.
   - (b) A navigation to `/chats/` that no Chat worker controls now goes network-first through the root worker. Offline or on a 5xx it gets Today's kept page. Online it is unchanged.
   - (c) The Today page's Permissions-Policy now allows camera and microphone for itself, and its CSP allows `media-src 'self' blob:`. These are headers only, unconditional by design: one CSP for `/` and `/chats/`.
2. **The retiring worker's route message** to a framework window is `F.nav.go(its own URL)`, which closes any open sheet in that window. That only happens when the browser fetches the old worker's update. That happens on a navigation inside `/chats/`, so the window has usually just loaded. If HOST unregisters `/chats/` before the service starts (risk I11), this is rarer still.
3. **fw.lazy's retry form** `import("./x.js" + q)` is stamped to `"./x.js?v=…" + q`, so a retry asks for `?v=…?retry=1`. That copy is sent `no-store` (fresh, which is right for a retry), and the root worker passes it to the network.
4. **`/chats/in/` is behind the hub's key** (503 until the hub is ready), as every page of Chat's hub copy is. HOST's hop has to happen only once the hub says it's ready (S3-D8, D13).

## What other batches need to know
- **HOST:** the framework window must answer `{ifl:"route"}` (`frame.js` already does) for the retiring worker to leave it alone. Chats' files are kept at plain paths, and the module may load them plain or as `?v=<12 hex>`. Never keep `/chats/in/…` or `tracker`/`handover` files: the root worker refuses the whole keep.
- **CORE:** `new URL("./core.js", import.meta.url)` in `service.js` is stamped, so `core.js` is immutable at its stamp; `import("../rank.js")` in `core.js` is stamped too. Keep the `/roof/` import graph acyclic: a cycle still serves, but that edge goes unstamped, which risks two module records.
- **I:** `min/` and `APP_VERSION` are the integrator's. `appstamp` goes green with `minify.mjs`. For rollback: `roof.yml app=chats state=off` puts `ROOF_CHATS=0`.
- **Q:** `hubstack` takes `roof-chats` to turn Chats on and `roof-off-chats`, which is the same as the default, stated outright.
- **B0:** at the time of the first merge, `roofrouter.test` had 2 failures against B0's new `REGISTRY.chats`. B0's later commits fixed them; green after the second merge.
- **needsFromOthers:** none.
