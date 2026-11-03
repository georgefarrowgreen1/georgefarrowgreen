# Stage 3 (Chats under the roof): risk critique of `s3/spec.md`

Checked against MAIN `0eb3506` and IFL `dee9d49` (`claude/one-roof`). `file:line` means those checkouts. "Spec §x" and
"S3-Dn" mean `s3/spec.md`. Most of the spec's citations hold: `makeIFLChat` 810-820, `syncPath` 800, the IDB shapes
947-982, `useKeys` 2700, `back` 2795 (after `atRoot` it reads `/chats/`, so the account page's rule really is unchanged),
`hub.js:131/159`, `sw.js:235-242`, and `menu.js:483/540/546/595/645`. `importPriv` is non-extractable (`crypto.js:88`), and
the five core imports touch no DOM (grep: 0 hits for document/window/localStorage/location/navigator). The findings
below are the places where the spec is wrong, leaves a gap, or relies on behaviour the code does not have.

---

## BLOCKING

### B1. The rollback switch does not bring back sign-in. Sign-in for all of InFlite would depend on MAIN's new `/_hub/in/`.
- Spec §4.2 and S3-D8 change Today's Sign In links to `/chats/in/#signin-start&then=…` (IFL `today/public/app.js:945,1843`).
  `/chats/in/` exists only once MAIN's `_middleware.js` serves `/_hub/in/`. Today, `x = "/in/"` maps to
  `/pigeon/in/`, which `serveApp` 404s (`functions/_middleware.js:107-116`, `functions/_app.js` APP_PAGES).
- `ROOF_OFF_CHATS=1` does not change those links (§8 only flips `/chats/`). Rollback level 2 says "MAIN needs nothing".
  If MAIN is ever reverted, or a MAIN deploy breaks `/_hub/in/`, **nobody can sign in to InFlite**, with the switch on or
  off.
- **Fix:** leave Today's links (`app.js:945,1843`) and `menu.js:548-552` as they are (`/chats/#signin-start&then=`). The
  hop in the framework (S3-D8) already moves them to `/chats/in/` while Chats is on. With `ROOF_OFF_CHATS=1`, milestone
  1's page at `/chats/` handles the trip itself, so the switch really does restore sign-in. Cost: one client-side hop, and
  there is less to build (no `app.js` href change). Also add to §8 level 2: "never revert MAIN while the IFL chats rule
  is live; flip `ROOF_OFF_CHATS` first". Add a test: `todayauth` with `apps.chats:false` signs in through `/chats/` with
  no `/chats/in/`.

### B2. `service.js` gets loaded under two URLs. That makes two module instances, so two core Workers write the same IDB.
- `stampImports` rewrites every `"./x.js"` in a served `.js` file to `"./x.js?v=<fp>"` (`functions/_app.js:74-79`). If
  `chats.js` imports `./service.js` statically (§5.6 lists `service.js` in the "page static graph"), the module gets
  `/chats/roof/service.js?v=…`. Meanwhile `modules.loadService` and `F.service` import `REGISTRY.chats.service` =
  `/chats/roof/service.js` with no `v` (the same pattern as `modules.js:38` for the entry). These are different module
  records with different `startService` state, so each makes its own Worker (`new Worker(new URL("./core.js", import.meta.url))`).
- Both cores then run sync and rewrite whole values: `outboxSave` writes the entire `S.outbox` array
  (`pigeon/app.js:10649`), and `cache:`, `drafts:` and `pins:` work the same way. The later write wins, so **queued sealed
  messages are lost**. The page also runs double syncs and holds double memory.
- **Fix:** module files never import `service.js`. They get the service only through `fw.service()`. `roofcontract` should
  fail on any `from "./service.js"` in `pigeon/roof/*`. Have `loadService` cache the service on `globalThis`-free
  framework state keyed by app. In `roofchats` part 1/5, assert `page.workers().length === 1` after Today idle start,
  after opening Chats, and after Send from Weather.

### B3. The key-trust (TOFU) gate is not protected, and stage 3 makes a fresh unlock the common case.
- S3-D5's verbatim list leaves out the functions that decide trust: `checkPin` (`pigeon/app.js:3470-3474`, which sets
  `keyChanged`), `trustNewKey` (`3476-3488`), `setVerified` (`3412`), `seenPlain` (`3522`) and `base` (`3503`). It also
  leaves out the **`pinsWait` gate**: sync waits for the server's pinned keys before it trusts anything (`3286`), and
  start sets the wait when this phone has no pins (`12280` in `engineStart`, `12445`). `sync` is listed as "ported with
  changes", so nothing pins the gate.
- Every phone whose key lives at chat.inflite.ai arrives at inflite.ai with an empty `pins:<uid>` (S3-D8, R3). If the
  core's first sync runs before `restorePins` resolves, `checkPin` pins whatever key the server sends on first use. A
  server that swaps a friend's key at that moment would go unnoticed. That is the attack TOFU-plus-server-pins exists to
  stop.
- **Fix:** add `checkPin, trustNewKey, setVerified, seenPlain, base, isVerified, wasVerified, checkMyKey` to the parity
  list. Make the core's `start` copy `engineStart`'s pins block line for line (`12276-12281`). Add a behaviour test in
  `roofchatcore`: empty IDB, server pins hold key A, sync returns key B → `keyChanged === true`, `pins[id] === A`, and
  `sendRun` to that friend is refused.

### B4. The App Lock is unknown to the core at start, so Today can show message words while Chat is locked.
- The engine read the lock from its own page before it answered anything (`if (lockPrefs()) S.locked = true`,
  `pigeon/app.js:12281`; `engineWaiting` returns `[]` unless the state is `ready`, `12218-12219`).
- The spec puts lock prefs on the page side (S3-D14), says the core has no `localStorage` (§5.2), and its `start({ visible })`
  carries no lock flag (§5.4). Today's idle `service.waiting` (`day.js:329-335`) would therefore get words from an
  unlocked core.
- **Fix:** `start({ visible, locked })`. `service.js` reads `inflight-lock` (LOCK_KEY) before the first call. The core
  starts **locked by default** until `start` says otherwise. Add a test: `roofchats` part 9 *at boot* (lock set, reload
  Today, no `.dw-said` text, and the hostpass log shows no `messages?with=` before unlock).

### B5. There is no safe way to add a passkey. The design invites sending the private key to the page.
- Locking a new passkey's vault needs the private JWK: `S.secretJwk || askPasswordForKey()` (`pigeon/app.js:3215`). The
  `askpw` form gets it from `vaultWith(password)` → `E2E.unlock` (`10314-10320`). `secretJwk` is set only by `useKeys`
  (`2702`), which runs only on Chat's own sign-in page. After a resume, the core never has it.
- §5.4 offers only `passkeyAdd(prf, credId)` and `reauth(password)`. No method unlocks the vault inside the core.
  `passkey-register` also needs the attestation fields (`3205-3207`), which the RPC does not carry. So the Passkeys page
  either breaks, or someone adds a method that hands the JWK back to the page. S3-D3 also lets the core keep `secretJwk`
  "while it exists".
- **Fix (cheapest):** Chat Settings › Passkeys opens Chat's own page (`/chats/in/#account`, the audited page that already
  does all of this) instead of porting it. If it must be ported, use `passkeyBegin()` → options (page calls
  `navigator.credentials`), then `passkeyFinish({ id, rawId, publicKey, alg, clientDataJSON, authenticatorData, prf, password? })`.
  The core does the register, the `vaultWith`, the `E2E.lock` and the vault POST, and wipes the JWK. Never keep
  `secretJwk` in the core. Add an RPC-table test: no method's result may contain a key with `d`, `kty` or `ecdh`. Add
  `trust(id)` (`trustNewKey`) explicitly. Today the "accept a changed key" step is missing from §5.4, and folding it into
  `verify(id,on)` would change its meaning. Replace the `friend*` and `group*` wildcards with the full frozen list.

---

## IMPORTANT

### I1. `service.call()` hands the whole RPC (plaintext and sending) to every script on the page, so the tap gate does nothing.
`IFL.hub.chat = () => F.service("chats")` (S3-D6) gives Today, every card and every module the full service. `call("sendRun")`
or `call("sendText")` skips `sendTo`'s tap check. `call("open"|"search")` returns plaintext to any module. The engine
exposed only `makeIFLChat`'s frozen seven keys across a realm boundary (`pigeon/app.js:810-820`). In the same realm, the
"getters captured at load" (`12247-12248`) add nothing either: `service.js` loads at idle, after the page's scripts have
run. **Fix:** `F.service("chats")` (Today, `IFL.hub.chat`) returns a frozen facade with the seven `IFLChat` keys only.
Only the Chats module's `fw.service()` gets `on`/`call`. Write in `service.js`'s header that the tap check is
best-effort inside one realm.

### I2. The page store keeps a chat's plaintext after you leave it, and it grows without limit.
§3.2 says `store.js` "keeps the last value per topic", with a topic per opened chat (`chat:<id>`). S3-D3 says the page
"lets go of it when it leaves". As written, every chat you open stays in the page heap until the page dies, and the page
never reloads. **Fix:** on `core.leave()` and on `locked`, the core emits `{ topic:"chat:<id>", data:null }` and the store
deletes the key. The store also clears `chat:*`, `typing:*` and `rows` lines on `locked` and on unmount. Unit test in
`roofchatviews`.

### I3. Sign-out paths that leave a live core behind.
- When Today learns it was signed out (a 401, or the SW's word), `signedOutNow()` (`today/public/app.js:1166-1174`)
  calls `unframe()` but never touches Chat. §3.4 keeps the Worker "if Today still uses the service". The core keeps its
  token, key and plaintext in a signed-out page. If someone else then signs in in the same tab, the framework reuses that
  service.
- In `signOut()`, the race times out after 4 s (`1135-1138`) and `forgetApps` deletes IDB from the page (`1143`) while a
  slow core is still running. Its debounced `cacheSave` (600 ms, `pigeon/app.js:3862-3868`) can write `cache:<uid>`
  back.
- **Fix:** `signedOutNow` and `signedIn` with a different `user.id` call `service.release({ terminate: true })`.
  `forget()` sets a `gone` flag that refuses every later IDB write. `signOut` awaits terminate before `forgetApps`. Test:
  a 401 mid-session leaves `page.workers()` at 0.

### I4. The engine and the core can both be alive while `apps.chats` is not yet known.
At `/`, a trusted `sessionStorage` written by a 1.10 page (`"1"`, read "as Weather's", §4.2) leaves Chats unknown or off.
Then `signedIn` makes the engine at idle (`app.js:1203`). If a later `hubAgain` says Chats is on, the spec swaps
`IFL.hub.chat`, but the engine iframe stays in the DOM. `dropEngine` is private to the block (`menu.js:597`) and only
`degrade` calls it. That gives two Chat instances writing one IDB (see B2). **Fix:** treat a bare `"1"` as "ask again"
(as `hubReady` already does for a `BOOT_APP`, `app.js:886-888`), never make the engine before `apps` is known, and on a
swap remove `.ifl-engine-box` from the document.

### I5. S3-D7's "not ready → the sheet says why" cannot happen. `wrap()` is not applied either.
`hub.send` calls `c.share` only when `c.state === "ready"`. Otherwise it does `location.assign("/chats/#share=<words>…")`
(`menu.js:540-543`): a full navigation, with the card's words in the address and in history. §5.5's "wrapped by the
shared block's `wrap()` already" is false. `wrap` is applied only inside the block's own `chat()` (`menu.js:595-626`),
which a replaced `IFL.hub.chat` bypasses. So nothing shows the "Sent to Pat. You're still here" toast after a `share`
(the engine called `parent.IFL.hub.sent` itself), and S3-D7's `IFL.hub.sent(say)` from module code would fail
`roofcontract`'s `\bIFL\b` rule (`roofcontract.test.mjs:289`). **Fix:** `send.js` toasts through `fw.toast` itself. Either
write down that a not-ready Send from a card does a full navigation to `/chats/#share=` (and keep that route's raw hash
out of `F.route` once it is tidied), or have the facade's `share` work in every state. In that case `state` needs a
separate `canShare` flag, which needs a `menu.js` change.

### I6. Contradictions in the contract that will break the build or push people into workarounds.
- S1's module greps forbid `indexedDB` and `serviceWorker` in module code (`roofcontract.test.mjs:285,292`). `core.js` needs
  IDB. The push `{inflight:"sync"}` from the root SW (`sw.js:228-233`) reaches windows only, and `service.js` may not
  listen on `navigator.serviceWorker`.
- **Fix:** list an exemption for `core.js` alone (`indexedDB`, `self.addEventListener`). Add a CONTRACT CHANGE: the
  frame relays `{inflight:"sync"}` as `F.on("push", { app:"chat", tag })` for `fw` subscribers.
- §5.2's "service.js is the only file that makes a Worker" is false for `../crypto.js:58` (Argon2's nested worker). Scope
  the grep to `pigeon/roof/*`.

### I7. The per-app roof is missing from two framework checks.
`loadModule` still refuses only when `!s.roof` (`roof/modules.js:37`), and `F.setRoof(v)` takes one boolean that unmounts
**every** module and bounces from any app (`roof/frame.js:123-135`). §4.1 changes neither. With `ROOF_OFF_CHATS=1` and
Weather on, the D14 check passes for Chats, and a Chats-only switch unmounts Weather. **Fix:** `loadModule` checks
`roofFor(app)`, and `setRoof({ weather, chats })` unmounts and bounces only the apps that changed. `roofnav` part 2 should
assert that Weather stays mounted when Chats goes off.

### I8. Rollback hands data back to milestone 1, and nothing tests that it can read it.
S3-D4 promises "same keys and shapes", but the core's writers (`cache:`, `outbox:`, `drafts:`, `pins:`/`pinsup:`) are
"ported with changes" and tested only against a stub in node (§10.1). If the shape drifts, milestone 1's `cacheLoad` and
`outboxLoad` (`pigeon/app.js:3870-3880,10651-10656`) fail. `bootFail` then deletes `cache:` and says "Chat couldn't open"
(`12526-12535`). A sealed outbox item that won't open is marked as an error. **Fix:** in `roofchatcore`, run the core's
writers and then app.js's readers (extracted the way `engine.test.mjs` extracts the rules block) on one fake IDB. In
`roofchatnav` part 2, queue a message offline in the core, switch Chats off, and check that milestone 1's page sends it.

### I9. Two writers on the outbox (two tabs, or the core alongside milestone 1 during a rollback).
Even with B2 fixed, two framework tabs (or a framework tab plus milestone 1's page at `/chats/` after the switch) each
rewrite `outbox:<uid>` whole (`10649`). That was already true for two Chat tabs, but stage 3 makes it routine because
every framework tab now starts a core at idle. **Fix:** in the core, read, merge by `id` and write inside
`navigator.locks.request("chat-outbox:"+uid)` (Web Locks work in Workers). Drafts and pins work the same way.

### I10. A stale reload ignores the composer, so typed text is lost.
`frame.js:457` reloads a stale page after 60 s away if no sheet is open. It does not check `F.busy()`, so composer text in
an open chat is thrown away. A protocol mismatch after any core restart sets `F.stale` (§5.4), and `core.js` is always
fetched fresh (I12), so this will happen. **Fix:** the module flushes the draft to `core.draft` on `hidden` straight away
(no debounce), and the frame's stale check also requires `!F.busy()`. Test: type, set stale, hide for 61 s, show; the
text is still there.

### I11. Service-worker traps.
- **The old `/chats/` worker controls the new page and its Worker.** Phones that used milestone-1 Chats have a `/chats/`
  registration (`pigeon/app.js:12540`, scope `/pigeon/`→`/chats/`). The longest scope wins, so it controls the framework
  page. Its `file()` serves `?v=` files cache-first (`pigeon/sw.js:33,62-70`), and it may control the core Worker. Its
  `page()` stores the framework's HTML as Chat's offline page (`39-46`). **Fix:** `start()` unregisters `/chats/`
  registrations *before* it starts the service, and the service waits on that promise.
- **The retiring script reloads framework windows.** §6.2 keeps stage 1's rule, "navigates windows at `/chats/`"
  (`roof.js:55`). Those windows are usually the framework itself, served from the network, and may be mid-message.
  **Fix:** post `{ifl:"route"}` first and navigate only windows that don't answer `routed` within 1 s, as `openIn` does
  (`sw.js:284-296`).
- **`?engine=1` in the root SW.** `ROOF_DOCS.includes(u.pathname)` ignores the query (`sw.js:46`). An engine iframe that
  loads offline or gets a 5xx would be given the framework's kept `/`. **Fix:** `roofDoc` skips `/chats/` when the search
  has `engine`.

### I12. Stamped imports and Today's modulepreload don't line up.
`preload` puts `<link rel=modulepreload>` on the plain `connector.files` paths (`modules.js:76-89`). Chats' graph imports
`?v=` URLs (`_app.js:74-79`), so every preload is downloaded again under another URL, and §5.6's "requests ≤ files+3"
will fail. `core.js` comes from `new URL("./core.js", import.meta.url)`, which drops the query, so it is `no-store` on
every Worker start (`_app.js:118`). **Fix:** for Chats, preload only the entry and `service.js`, or have `connector.files`
carry stamped URLs from a server-written manifest. Write down that `core.js` is always fresh, and keep the protocol
integer as the guard.

### I13. `/chats/in/` is Chat's whole app in the page, and it has relative paths.
- When a session already exists, any boot at `/chats/in/` without `#signin-start&then=` renders full Chat there
  (`pigeon/app.js:12432-12440`): keys in the page, non-quiet `sync`, chats marked read. That can come from Back, a
  bookmark, or Not Now. "With no `then` it goes to `/chats/` once signed in" covers only `signInBack`. **Fix:** at
  `/chats/in/`, a boot that finds a session and no sign-in under way goes `location.replace("/chats/"+hash)`. Write the
  SW guard as `"/pigeon/in/"` so `atRoot` maps it at both addresses.
- `brandLine`'s `<img src="inflite.svg">` (`2755`) resolves to `/chats/in/inflite.svg`, which is a 404 on the sign-in
  screen. Serve `/_hub/in/<file>` as `/_hub/<file>`, or make the path absolute in the hub copy.

### I14. Gaps in the tests (behaviour nothing would catch).
1. Argon2 in the core under WebKit's CSP (risk 7) has only a "phone check". Re-auth, and a passkey add if B5 isn't taken,
   fail silently. **Fix:** a Playwright **WebKit** run of `reauth` at the framework page (one project, one test).
2. Only one Worker on the page (B2), and none after a 401 (I3).
3. TOFU on a fresh unlock (B3), and the lock applied at boot (B4).
4. The store drops the chat on leave and on lock (I2).
5. Rollback readability and outbox continuity (I8).
6. Sign-in with `apps.chats:false` (B1).
7. The retire script doesn't reload a framework window (I11).
8. A push `{inflight:"sync"}` while the page is hidden with a chat open must not mark it read. Today `loadChat` runs
   whenever `S.view==="chat"` (`3309`), regardless of visibility. The core should treat "on screen" as shown **and**
   visible.

### I15. Smaller correctness points to settle before B0'.
- **The core writes `cache:` while only Today is open.** `cacheSave` had `if (ENGINE) return` (`3863`). S3-D6's "keep
  nothing" is false unless the core keeps that guard whenever the Chats screen has never been shown.
- **Blob URLs in the core.** `outboxOpen` makes blob URLs (`10664-10668`). If the core makes them, they die with the
  Worker. Move all URL making to the page, as §3.1 `media.js` implies.
- **The device rule.** `pigeon/theme.js` doesn't run in the framework, so S3-D13 needs its own device test in
  `chats.js`, shared with `theme.js`, not a copy.
- **`hub.degrade()` doesn't release the service.** It drops only the engine (`menu.js` degrade). Release the service in
  `applyHub("no")`.
- **The `roof-chats-<BUILD>` cache.** It is kept "whole" per build. A change to `pigeon/cards.js` or another reused file
  without a Chat version bump would leave a stale offline copy. State that every change to `pigeon/roof/*` or its
  reused `../` files bumps `APP_VERSION` (the same rule makes `watchVersion` work).

---

## A faster path (the relayed request: "how can this whole process be made faster")
Several fixes above also cut work:
- **B1:** keep the Sign In links as they are. That is one less IFL change, no change to `todayauth`, and rollback stays
  one secret.
- **B5:** link Passkeys, and possibly Sessions and password re-auth, to Chat's own page instead of porting them. That
  removes the riskiest part of the deep CORE review and the WebKit Argon2 question.
- **I1:** two facades instead of policing the RPC. It is one small file and shrinks the review surface.
- Add the B2, B3, B4, I2 and I8 tests to `roofchatcore` and `roofchatservice` as **unit** tests (node, no e2e slot). Then
  the e2e list can stay at the three files named, and the CORE review checks a list instead of re-deriving it.
