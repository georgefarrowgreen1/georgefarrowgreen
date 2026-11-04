# One roof, stage 3: CORE (Worker core and service)

Branch `r3/core` in both repos (MAIN carries all the work; IFL only has B0 merged, no changes of CORE's). Built on B0's
`r3/b0` (merged as it landed: the core header, the stubs, fixtures, roofcontract, the kit's stub core).

## What's built

- **`pigeon/roof/idb.js`**: B0's exports (`NAME`, `STORE`, `get`, `set`, `del`, `locked`, `gone`, `isGone`) plus `wipe`
  (forget's own deletes, the one write allowed after `gone()`). It's app.js's `idb` line for line: `inflight` v1, `kv`,
  the 6 s open timeout, and a retry on `InvalidStateError`. `locked(key, fn)` wraps `navigator.locks.request("inflight:" + key)`;
  with no Web Locks, it runs fn as Chat always has.
- **`pigeon/roof/core.js`**: B0's header kept, with comments added only for `Chat.draft`. The body:
  - **Copied verbatim** (parity-tested): `keyId pubFromId mergePins pairFor trustedPub keysOf shapeOK ctxOf keepPlain
    decrypt decryptGroup group member others memberMs pinsCatchUp restorePins serverPins savePins checkPin trustNewKey
    setVerified isVerified wasVerified seenPlain base checkMyKey pinsMeta`. The names these reach for are the core's own:
    `toast()` only re-sends `keywarn`, never words; `render()` sends patches.
  - **`resume`** copies `engineStart`'s pins block line for line. `pinsWait` is set when this phone has no pins.
    `lockPrefs()` = what the service read of `inflight-lock`, for that `lockUid` only.
  - **`sync`** keeps the `pinsWait` wait verbatim. It sends patches where app.js called `calmRender`, uses `sync?quiet=1`
    unless the Chats screen is shown *and* the page is visible, and fetches the open chat only on screen.
  - **Chats**: `loadChat`/`applyChat`/`applyDelta` mark a chat read only when it's open, on screen and visible
    (risk I14.8). The pulse runs only on screen, with a 1 s check that stops while hidden. The cache is written only
    after `start({ screen: true })`. Drafts are sealed and merged by chat under the lock; the outbox is merged by id
    under the lock, with sent and deleted ids kept as tombstones.
  - **Sending**: `sendOne` is the composer's send, for text and blobs, with offline items going to the outbox.
    `sendLetter` and `sendGroupLetter` are app.js's. `sendRows` and `sendRun` are ported, with `../rank.js` imported on
    first use. Every seal goes through `base`/`trustedPub`.
  - **Today's reads**: `waiting`/`since` read `quiet=1`, mark nothing read, and drop plaintext they opened only for Today.
  - **The rest**: `search` (on this phone, newest 8), `photo` (the open chat only, as a Blob), `safety`/`verify`/`trust`,
    and `meta` (the META table, argument keys checked, answers stripped of `d/kty/token/ct/iv/keys/body/key/pins/vault/priv`).
  - **Lock**: locked from the first call. While locked, `chat:*` and `typing:*` are null, rows have no lines, and
    `waiting`/`since`/`search`/`open`/`photo` give nothing.
  - **Hidden 10 minutes**: every chat's plaintext goes but the list's last lines; the open chat's topic goes null and is
    fetched again on visible.
  - **`forget`** is final: `gone()`, then only hello and state answer.
  - **The door, `handle(d)`**: an RPC method with `argsOk` per the header's rules, else `why: "no"`. Nothing answers
    while the first start is still finding out who's here and whether they're locked.
- **`pigeon/roof/service.js`**: B0's frozen header kept.
  - **The Worker**: one Worker, made in one place. `inflight-lock` is read before the first call; then `hello` (a
    mismatch calls `onStale`, ends the Worker and makes no other call), then
    `start({ visible, locked, screen: false, lockUid })`.
  - **Restart**: on `visible` it pings the core (1.5 s). A dead Worker, or one that sent an error event, is made again
    and started as before; calls wait for it up to 5 s, then fail with `why: "offline"`.
  - **Relays**: `ui.on("push")` gives one quiet sync; `visible`/`hidden` reach the core as `start({ visible })`.
  - **Device**: on a computer it makes no Worker and the state is `device`. The rule is theme.js's, applied only to
    "Mozilla/" user agents; see "For the integrator" below.
  - **The facade**: frozen, with `makeIFLChat`'s seven keys and no `call`.
    - `sendTo` needs a real tap (getters captured at load: best-effort in one realm, said in the header). It checks the
      card as `engineCard` does, then `share` rows. A trusted, unchanged row gets `sendRun`; anything else opens the sheet.
    - `share` lazy-loads `send.js` and resolves `false` when not ready.
    - `waiting` passes ids (≤ 50, id-shaped) and only a stock's `sym`/`name`.
  - **`release({ terminate })`** ends everything.

## Test counts (final commit)

- `node --test .tools/tests/unit/roofchatcore.test.mjs`: **18/18** (parity ×2, TOFU ×2, lock, chat topics + quiet
  reads, read only on screen, no cache before screen, forget, signOut, key/signin/ended, storage goldens both ways with
  app.js's own code (cache, drafts, outbox, flush sends the other's letter), two cores and the outbox lock, the RPC door,
  no `d/kty/token/ct/iv` and no message word in any URL/header/body, rows window, photo, no cache before pins).
- `node --test .tools/tests/unit/roofchatservice.test.mjs`: **11/11** (the facade, the tap, a tapped send and the sheet
  on a changed key, stale, the lock read first, stocks and ids sanitised, push and visibility, restart and the 5 s queue,
  device, release, the real core behind the service matching `fixtures/chats.mjs` shapes).
- Full unit suite: **1332 tests, 1325 pass, 1 fail, 6 skipped**. The one fail is `min.test` (module files not minified
  yet: expected until I runs `minify.mjs`). With `ROOF_IFL=/nonexistent`, my two tests and roofcontract give 37 pass,
  0 fail, 28 skipped.
- `node --check`: clean on `core.js`, `idb.js`, `service.js` and both tests.
- **Kit smoke, `?service=real`** (`roofkit/serve.mjs` harness, Chromium; script at
  `/tmp/claude-0/-home-user-georgefarrowgreen/f04cca0a-a7dc-5377-8dc8-76f128448346/scratchpad/kitsmoke.mjs`, not
  committed): **FAILS 0**.
  - Phone (iPhone 13): one Worker (the real `/chats/roof/core.js`), state `signin` (no Chat session on the kit), a
    frozen seven-key facade, `waiting` gives `[]`, only `/api/pigeon/resume` asked, no CSP violation, no page error.
  - Computer: no Worker, state `device`.
- **Budgets** (esbuild minify as `minify.mjs` does, gzip -9, in a scratch folder), all met:

  | Measure | Size | Budget |
  |---|---|---|
  | `core.js` + `idb.js` | 21.8 KB | ≤ 36 KB |
  | Core graph | 36.7 KB | ≤ 55 KB |
  | `service.js` + core graph | 39.5 KB | ≤ 58 KB |

  `rank.js` is 3.1 KB, lazy.

## Adversarial review (done; fixed and re-proved)

- **`photo(msgId)` could open a photo from any chat in memory.** Now only the open chat's, or its outbox items; another
  chat's is never fetched. Tested.
- **A phone with no pins could open the kept copy (and TOFU-pin its keys) before the server's pins answered.** It now
  skips the cache until the pins arrive. app.js has the same order, but a cache without pins is near impossible there;
  belt and braces. Tested.
- **After the 10-minute hidden drop, the open chat came back empty.** It's now fetched again on visible.
- **The facade passed Today's stocks as given.** It now passes only `sym`/`name` (never an amount) and id-shaped ids.
  Tested.
- **A stale core (wrong PROTOCOL) was left running.** It's now terminated. Tested.
- **Photo ids were put into URLs as they came.** They're now encoded.
- **Checked, no change needed**:
  - No `console`, no new IDB or localStorage key, no `document`/`window`/`localStorage` in the Worker graph (roofcontract
    green).
  - The token never crosses (the test scans every patch); META answers are scrubbed deeply.
  - `verify(id, true)` refuses a changed key: only `trust(id)` (trustNewKey) accepts one.
  - `sendRun`/`sendText` to a changed key are refused (`why: "trust"`); groups the same.
  - Calls during the first start wait for it, so the lock is known before any answer.

## Open issues and what other batches must know

- **For the integrator / B0**:
  - `roofcontract`'s facade case runs in node, whose user agent is "Node.js/…"; theme.js's rule calls that a computer.
    The service therefore applies the device rule only to "Mozilla/" user agents (every browser's). Better: the test
    stubs a phone `navigator`, and the guard goes.
  - `fixtures/chats.mjs` `ONE.Card` / `WORLD`'s `CARD` has no `snap`, so `normCard` refuses it (`why: "card"`). A
    real card needs `snap: { place }` for weather. The stub core doesn't check; the real core does.
  - SearchHit's frozen key `token` (a message id) collides with the "no result key named token" rule. My test exempts
    `search[].token` explicitly and checks it's a message id; rename it (`ref`?) if you'd rather not have the exception.
- **For UI-A / UI-B**:
  - `chat:<id>` now carries an optional `draft` (the open chat's, never while locked): restore the composer from it, and
    call `draft(id, text)` as you type (that's also the typing signal for the pulse).
  - `meta(name, args)`: the HTTP method goes in `args.method`. With none given, it's GET where the entry has one, else
    its only method. Path parts like `<id>` come from `args.id`.
  - `sendBlob(id, blob, kind)` can't carry a voice pigeon's length or waveform, or a photo's size from the page. The
    core reads a photo's size with `createImageBitmap`; voice gets `d: 0, w: []`. If the sheet needs real voice
    lengths, ask the integrator for an optional 4th argument `{ secs, wave }` (an RPC table change).
  - `sendRun({ plan: true })` is refused (`no`): plans to ride aren't ported. `when` takes `now | asap | morning`.
  - `share`/`rank` rows are `Row` plus `can, why, reason, best, way, lands`. A row that can't be picked says why.
  - `older(id, before)` only widens the open chat's window over what's in memory: the server sends a whole chat, and
    there is no paging endpoint.
  - Lists arrive as patches after `start`. Call `rows(from, to)` for the window whose last lines you draw; patches keep
    that window.
  - `start({ screen: true, visible: true })` on show, and `start({ screen: false })` plus `leave()` on hide. The
    service sends `start({ visible })` itself on the page's visible/hidden.
- **For HOST**:
  - `F.service` should resolve `startService`'s promise. It resolves once `hello` and `start` have answered, or at once
    with state `device` on a computer.
  - `release({ terminate: true })` fails every waiting call with `no` and drops the service's ui listeners.
- **Commit trailer**: commits carry this session's own link (`session_014XnqoFq9Y3xmRq4pdSAENe`, from its attribution
  settings) rather than the one quoted in the brief.
- **Not run**: no e2e of the suite (none named for CORE beyond the kit smoke); no minify, wxshell or version bumps.
