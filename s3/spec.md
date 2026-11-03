# One roof, stage 3: Chats under the roof (build spec, revised)

MAIN = `/home/user/up4/tf/georgefarrowgreen`, IFL = `/home/user/up4/tf/inflite`, both `claude/one-roof` (read at MAIN
`0eb3506`, IFL `dee9d49`). `file:line` refers to those checkouts; names come first, lines drift. Read with stage 1's
`roof/spec.md` ("S1 §x", "S1 Dn"), `roof/addendum.md` (R1–R3 bind this spec), and stage 2's `roof/s2/spec.md` ("S2 Cn":
its contract changes are built and merged before stage 3 starts, and their names win). Where this spec and a map
disagree, this spec wins; the addendum wins over both. The critiques this revision answers are `s3/critique-risk.md`
("risk Bn/In") and `s3/critique-build.md` ("build Bn/In"); every BLOCKING and IMPORTANT item is answered in §13.

**Stage 3 is built right after stages 2 and 4** (R3), on `claude/one-roof-s3`: made from `claude/one-roof` once stage 1
is live, with stage 2's integration branch (and stage 4's, if it has merged) merged in before B0 starts. So stage 3
**uses stage 2's general forms** (S2 C2 `REGISTRY` roof object and `link`/`idb`, S2 C3 `mods`/`ifl-mods`/`F.session.mods`/
`F.setRoof(on, app)`, S2 C4 `connector.lazy`, S2 C5 one `idb.js` per module) and **stage 4's** `stay` (S4 C2),
`header.set({ sections: false })` (S4 C3) and `fw.nav.go(path, { replace })` (S4 C4). It adds its app to them and names
only what is new as **S3-Cn CONTRACT CHANGE** (§5). If, when B0 starts, the integrator froze other spellings for the
shared forms (stage 4's draft says `apps`/`ifl-roof-apps`/`ROOF_<APP>=1`), B0 renames this spec's uses mechanically:
the meaning doesn't change.

---

## 0. In short

- **Chats becomes the framework's second tab screen**: Today · **Chats** · Apps · You, all one page. `/chats/` is the
  framework page (as `/weather/` is), and the Chats module draws the list (In the Air, chats and groups), a chat or
  group, Friends, Requests, Add, and Chat's sheets, with the framework's header, tab bar, sheets, toast and search.
- **Chat's crypto core runs in a dedicated Worker** (`pigeon/roof/core.js` + `idb.js`): the session token, the private
  key handle, IndexedDB, pins and the trust gate, sync, decrypt, seal, outbox, drafts and the plaintext store live
  there. The page sees only what the screen on show needs, and lets go of it when it leaves (S3-D3). **The core never
  holds the private key as a JWK and never runs Argon2**: unlocking, passkeys, password re-auth, sessions and the app
  lock's set-up stay on Chat's own audited page (S3-D8). Nothing new reaches any server.
- **The engine iframe leaves the framework page.** Today's Waiting for You, one-tap Send and Sign Out talk to the same
  core through a frozen seven-key facade (`IFLChat`'s shape), plugged in where Today already asks for `IFL.hub.chat()`;
  `cards.js` and `menu.js` don't change (S3-D6). Today stops loading all of Chat (≈ 270 KB gz) to read who's waiting.
- **Send to a friend is the framework's Send**: Chat's send sheet, drawn by `send.js` in a framework sheet, sealed in
  the core (S3-D7).
- **Sign-in stays exactly where it is** (`/chats/#signin-start&then=…`); the framework hops it to Chat's own page at
  `/chats/in/` (S3-D8). With Chats switched off, milestone 1's page at `/chats/` does the trip itself, so the switch
  really restores everything.
- **chat.inflite.ai is untouched** apart from `APP_VERSION`/`APP_NEWS` and a small, tested block for `/chats/in/`
  (S3-D11).
- **Own switch**: `ROOF_OFF_CHATS = "1"` brings back milestone 1's Chats page at `/chats/` in seconds (§8).

---

## 1. Decisions

**S3-D1. Where the module lives: MAIN `pigeon/roof/`, served through the hub at `inflite.ai/chats/roof/*`.**
Chat's hub copy maps `inflite.ai/chats/x` → `chat.inflite.ai/_hub/x` → asset `/pigeon/x` (IFL `today/src/hub.js:21,146`;
MAIN `functions/_middleware.js:107-116`) through `serveApp`, which stamps `"./x.js"` imports with `?v=<fingerprint>` and
serves a file `immutable` only when the asked `v` matches, else `no-store` (`functions/_app.js:73-79,103-114`). Pure
files are reused from `../` (`crypto.js`, `cards.js`, `cardview.js`, `digest.js`, `links.js`, `rank.js`, geodata).
**Changes to `stampImports`, for files under `/roof/` only** (so standalone output stays byte-identical, pinned by
`roofchatserve.test`): (a) `"../x.js"` is stamped too (the path resolved with `new URL(rel, "https://x" + path)`);
(b) `new URL("./x.js", import.meta.url)` is stamped as well, so `core.js` is cached for good instead of `no-store` on
every Worker start (build I2). `crypto.js:58`'s own `new URL("./argon2w.js", …)` is outside `/roof/` and untouched.
Rejected: copying into IFL (S1 D1).

**S3-D2. Identity: REGISTRY key `chats`, data id `chat`.** The route, `html[data-app]`, the tab and the connector are
`chats` (router `TABS.chats`, `roof.css:26` already has `[data-app="chats"]`); versions, `IFL.built`, push `app` and
storage stay `chat` (MAIN `pigeon/app.js:12511`, IFL `today/public/sw.js:190`). `REGISTRY.chats.id = "chat"` carries the
second, and `link: "chat"` names the own-address key of `F.session.links` (S2 C2) (S3-C1).

**S3-D3. The Worker boundary (R3).** `core.js` is a module Worker made by `service.js`
(`new Worker(new URL("./core.js", import.meta.url), { type: "module", name: "chats-core" })`; S3-C2). It holds the
token, the private key as the non-extractable `CryptoKey` read from IDB (`crypto.js:88`), pins and the pins gate,
pairs, messages, the plaintext store, the ciphertext cache, outbox and drafts (the state of `pigeon/app.js:910-927` minus
every view field). It makes every `/api/pigeon/*` call (Chat's bearer: the hub forwards `Authorization` for Chat only,
`hub.js:159`; a worker's POST carries `Origin: inflite.ai`, which `hub.js:131` requires).
- **What crosses to the page** (shapes frozen in B0, §5.5): metadata views (friends, groups, requests, rows with *their
  last line only for rows the page asked for*), the opened chat's messages as view models, search results, digest words
  for Today's facade, photo/voice `Blob`s (structured-cloned). **Never** the token, a key or JWK, a pin, a ciphertext
  body, or another chat's plaintext. Object URLs are made only in the page (`media.js`), never in the core.
- **What crosses to the core**: method calls from the frozen allow-list (§5.4) with plain arguments, each checked for
  type and length; text you typed (to seal); a recording or photo `Blob`. **No password, PRF output or JWK ever**
  (S3-D8).
- **Honest limit, written into `core.js`'s header**: the Worker keeps keys and the plaintext store out of the shared
  page's heap and DOM; the text of the chat on screen is in the DOM while you read it. It does not stop hostile code of
  the same origin (it could open IndexedDB itself); every module is MAIN's own and `roofcontract` greps forbid
  `indexedDB`, `IFL`, `serviceWorker` and document-wide queries in page module code (S1 §5.1). Rejected: everything in
  the page (R3 says no); a separate origin framed (loses one roof, S1 D2).

**S3-D4. Same keys, same database, pinned both ways.** `pigeon/roof/idb.js` (the module's one IDB file, S2 C5) opens
`REGISTRY.chats.idb = "inflight"` v1 store `kv` with exactly the keys and shapes of `pigeon/app.js:947-982,2700-2711`
(`session`, `pins:<uid>`, `pinsup:`, `pinsunread:`, `cache:<uid>`, `drafts:<uid>`, `outbox:<uid>`, `notify-asked`); the
root worker's `tokenHere` already reads `session.token` from it (IFL `sw.js:235-242`). So a phone that used Chats at the
hub opens the module signed in and unlocked; rollback (§8) hands the same data back to milestone 1's page; Today's
sign-out still clears it. **No new IDB key, no new `localStorage` key.** The page keeps reading Chat's existing
`inflight-lock` (`LOCK_KEY`, `pigeon/app.js:10494`) and badge keys; no `today:*` key (scroll uses the frame's
`ifl-roof-y`, S1 D20).
- **Golden fixtures** (risk I8, build I11): `roofchatcore.test` writes each key with the core's writers and reads it
  with `app.js`'s readers (extracted the way `engine.test.mjs` extracts the rules block), and the reverse; one outbox
  item written by each flush is sent by the other.
- **Two writers** (risk I9, build I18): every read-merge-write of `outbox:`, `drafts:` and `pins*:` runs inside
  `navigator.locks.request("inflight:<key>", …)` (Web Locks work in Workers); outbox merges by item `id`, drafts by chat
  id, pins through `mergePins`. `cache:` stays last-write-wins (it is a cache). Chat's own page and a milestone-1
  engine don't take the lock; that two-tab case already exists today and `sendRun` reuses a letter's id.
- **Nothing kept while only Today is open** (risk I15): `cacheSave` keeps `if (ENGINE) return`'s meaning: the core
  writes `cache:` only after the Chats screen has been shown in this Worker's life (`start({ screen: true })`).
- **`forget()` is final**: it sets `gone`, after which every IDB write is refused (risk I3).

**S3-D5. Port, don't refactor standalone; guard the copy.** `pigeon/app.js` stays as it is (S1 D9's rule) apart from
S3-D11. The core is a port of its UI-free parts. **Copied verbatim and pinned by a source-parity test**
(`roofchatcore.test.mjs`): `keyId, pubFromId, mergePins, pairFor, trustedPub, keysOf, shapeOK, ctxOf, keepPlain,
decrypt, decryptGroup, group, member, others, memberMs, pinsCatchUp, restorePins, serverPins, savePins`, **and the trust
gate** (risk B3): `checkPin` (`3470-3474`), `trustNewKey` (`3476-3488`), `setVerified` (`3412`), `isVerified`,
`wasVerified` (`3410-3411`), `seenPlain` (`3522`), `base` (`3503`), `checkMyKey` (`3329`). The core's `start` copies
`engineStart`'s pins block line for line (`12276-12281`: set `pinsWait` when this phone has no pins, `restorePins`
before the first trusted sync), and `sync` keeps the `pinsWait` wait at `3286` verbatim (parity-pinned as a slice).
Ported with changes (UI calls become patches; covered by behaviour tests): `api` (no `renderOffline`/`go`: emits
`offline`/`ended`), `resume` (reads the `CryptoKey` from IDB; never `useKeys`), `forget` (core half), `sync`
(`3281-3362`: patches instead of `calmRender`; "on screen" = shown **and** visible, risk I14.8), the pulse
(`3641-3855`), cache/drafts/view-once (`3856-4051`), outbox and sending (`10651-10760, 11352, 11426, 11666-11780`),
`searchMessages` (`7040-7072`, returns results), the engine functions (`12161-12245`). Stage 4+ may move standalone
onto the core and delete the copy (not here).

**S3-D6. The engine iframe goes; its API stays, as a frozen facade.** Today and its cards use `IFL.hub.chat()` (IFL
`today/public/app.js:1136,1203,1573,1944`; `day.js:298,329,591`) and `IFL.hub.send` (`cards.js:35,135`).
- While Chats is on for this page (S3-D12), Today's `app.js` sets `IFL.hub.chat = () => F.service("chats")`
  **synchronously at boot**, from the kept `ifl-mods` before the frame renders Today, and again in `applyHub`
  (build I5), so no `hub.chat()` call can make the engine first.
- `F.service("chats")` resolves (in every state) to a **frozen facade with exactly `makeIFLChat`'s seven keys**
  (`pigeon/app.js:810-820`: `state` (getter), `share, sendTo, waiting, since, refresh, signOut`) and their rules:
  `waiting`/`since` read with `quiet=1`, open in memory, mark nothing read, keep nothing (`12200-12230`); `sendTo` only
  on a real tap (`tappedOn`, `805-809`, `UA_GET/ACTIVE_GET` `12247-12248`), only to a friend whose key is trusted and
  unchanged, else the sheet (`12183-12197`). The full service (`on`, `call`) is given **only** to the Chats module via
  `fw.service()` (risk I1). `service.js`'s header says the tap check is best-effort inside one realm.
- `wrap()` does not apply (it only wraps the block's own engine, `menu.js:595-626`). What replaces each part: `share`
  returns `false | { ok, say } | { ok: false, why }` itself; `send.js` shows "Sent to Pat. You’re still here" through
  `ui.toast` (words as `menu.js:482` `stillHere`); one-tap `sendTo` keeps `day.js:597`'s toast.
- `IFL.hub.send` (`menu.js:536-545`) is unchanged: it calls `c.share` only when `c.state === "ready"`, else it does
  `location.assign("/chats/#share=…&back=…")`, a full navigation to the module's Send route (S3-D7).
- **`day.js`, `cards.js` and `menu.js` don't change**, except one `day.js` export for the lock (S3-D14). No `iflmenu`
  run, no other app's bump. The hub still serves Chat's own page for `/chats/?engine=1`, so milestone-1 hub pages of an
  app whose own roof is off keep their engine.

**S3-D7. Send = Chat's send sheet in a framework sheet.** `facade.share(words, packed, { to })` →
`ui.lazy(() => import("./send.js")).then((m) => m.openSend(ui, svc, { card, words, to }))`, where `ui =
F.forModule("chats")` is handed to `startService` (S3-C3). `send.js` ports `openSendSheet` (`11383-11425`), `sendRows`
(`11426`), rank from the core's `rank`, cards drawn by `cardview.js`; it resolves `{ ok, say }` or `{ ok: false, why }`;
the card is checked exactly as before (`engineCard` → `readShareHash`/`normCard`, `12161-12167`). Sealing is
`core.sendRun(spec)` (`11666`), so `trustedPub`/`keysOf` gate every send; `sendRun`'s `renderSheet()` progress calls
become `send` patches (`{ id, step: "sealing"|"sent"|"failed", why }`) drawn by the sheet.
- **Not ready** is reached only at `/chats/#share=` (a card's Send while not ready navigates there). The route's raw hash
  is read once and tidied with `replaceState` straight away (the words leave the address and the history entry); the
  sheet then shows, by state: `signin` "Sign in to send this" + Sign In; `key` "Unlock Chats on this phone to send
  this" + Unlock Chats; `locked` the lock screen, then the sheet; `device` "Chats is on your phone"; `offline` the sheet
  with the outbox note ("It’ll go when you’re back online"). After `signin`/`key` the card isn't kept: "Unlock Chats,
  then tap Send again" (S3-Q8). Done or Back returns to `back` (a `hubPath`, `788-791`).

**S3-D8. Sign-in, unlock and keys stay on Chat's own page, at `/chats/in/`.** InFlite's sign-in is Chat's trip:
`/chats/#signin-start&then=` (IFL `app.js:945,1843`; `menu.js:548-552`), back from the account's page at
`/chats/#signin=<code>` (`account/app.js:1134`, `<site>/chats/` exactly), where Chat unseals the unlock secret and stores
the key (`pigeon/app.js:2787-2846`). **Those links don't change** (risk B1).
- The framework page, booting at `/chats/` with a hash starting `#signin`, `#verify=`, `#invite=` or `#reset=`, does
  `location.replace("/chats/in/" + location.hash)` as the first line of `start()` (HOST). It only runs when the
  framework serves `/chats/`, i.e. Chats on. With `ROOF_OFF_CHATS=1` the hub serves milestone 1's page at `/chats/`,
  which does the trip itself: the switch restores sign-in even if MAIN's `/chats/in/` were broken.
- MAIN `_middleware.js` hub copy: `/_hub/in/` and `/_hub/in/index.html` serve Chat's page (as `/_hub/`), and any other
  `/_hub/in/<file>` is served as `/_hub/<file>` (so `brandLine`'s relative `inflite.svg`, `2755`, resolves; risk I13). IFL
  needs nothing (`/chats/in/` already forwards to `/_hub/in/`, `hub.js:139-146`).
- `pigeon/app.js`, active only when `atRoot` maps the path to `/pigeon/in/` (so the same code is right at both
  addresses): (a) no service worker registration (`12540`); (b) with no `then`, signed in → `location.replace("/chats/")`;
  (c) a boot that finds a session and no sign-in under way, with a hash other than the sign-in keys or `#account`, goes
  `location.replace("/chats/" + hash)` (Back, a bookmark, Not Now: never the full app in that page with non-quiet sync,
  risk I13). Chat's page builds `back` as `origin + "/chats/"` (`2795`), so the account page's rule is unchanged.
- **One unlock per phone** (R3): signed in to InFlite with no key in this origin's IDB (the core's `resume` says
  `signedIn`, the old `engineKey`, `12286-12287`) → state `key` → "Unlock Chats on this phone" + Unlock Chats →
  `/chats/in/#signin-start&then=%2Fchats%2F`; the account page offers the passkey first, so it is one tap where a
  passkey with PRF exists. Never a key copied across origins.
- **Keys work stays here too** (risk B5): Chat Settings' "Privacy & Security" row is a plain link to
  `/chats/in/#account` (Chat's own page: Passkeys, Sessions, Blocked, App Lock set-up, Encryption & Safety Numbers,
  password re-auth). So the core has no `secretJwk`, no `vaultWith`, no Argon2 path, no passkey registration, and the
  WebKit/CSP question for Argon2 in a Worker disappears. Per-friend safety numbers and verify stay in the module
  (`safety`, `verify`, `trust`: public keys only).

**S3-D9. Routes keep the old vocabulary** (S1 D6). `/chats/` list; `#open=<id>` a chat or group; `#friends`;
`#requests` (Friends + Requests sheet); `#add=<handle>` (Friends + Add sheet); `#settings`, `#account` (Chats + Chat
Settings), `#flightlog` (Chats + Flight Log); `#share=<words>&card=<packed>&back=<path>` (Chats + Send sheet, then back).
`#open=<id>` **stays in the address** (S4 C2's `stay`: an id, not words; Back, reload and `IFL.here` need it); every
other key is tidied after show (S1 D6). `share` is read raw (S3-C1 `raw`), then tidied.

**S3-D10. Polling only while shown; quiet otherwise.** The 1 s ticker (view code, owned by `chat.js` and `list.js`:
relative times, landing countdowns) and the 15 s sync request (`12487-12495`, asked by `chats.js` through
`core.sync`) run only while the Chats screen shows and the page is visible; the core uses `sync` then and
`sync?quiet=1` otherwise (`syncPath`, `800`), so Today open never counts as "seen in Chats". Hidden: no timers; Today's
refresh calls `facade.refresh()` (quiet, `app.js:1573,1944`); a Chat push's `{inflight:"sync"}` (IFL `sw.js:228-233`)
reaches the service through `ui.on("push")` (S3-C5) and triggers one quiet sync and `pushTag`. Marking read happens
only for the opened chat while shown **and** visible (`loadChat` `3567`). Hidden 10 min: the core drops every chat's
plaintext but the list lines asked for (re-opened from the ciphertext cache on demand).

**S3-D11. chat.inflite.ai keeps working, unchanged.** In `pigeon/app.js`: `APP_VERSION`/`APP_NEWS` (`835-836`) and the
S3-D8 `/pigeon/in/` block (three guarded behaviours, `12540`, `2837`, `12432-12440`), nothing else; `index.html`,
`sw.js`, `styles.css`, `theme.js` untouched. Standalone e2e (`chats`, `instant`, `security`, `sec2`, `syncperf`,
`storage`, `vanish`, `pigeonway`, `move`) stay green unchanged; `chatsonly.test`/`engine.test` unchanged green.
**Every change to `pigeon/roof/*` or a reused `../` file bumps `APP_VERSION`** (risk I15: the root worker keeps
`roof-chats-<BUILD>` whole per build, and `watchVersion` keys on it).

**S3-D12. Per-app roof, decided once per page.** Chats is in the page iff `hub ready && mods.chats` (S2 C3) **and it
was so when this page booted** (risk I4). Turning Chats off mid-session (switch) takes effect on next visible: the
module unmounts, the core is terminated, `IFL.hub.chat` is put back (the engine is made only if something asks again).
Turning it **on** mid-session takes effect at the next page load: the host keeps passing `mods.chats: false` to the
frame until then, so an engine made earlier and a core never live together. A bare `"1"`/`"0"` in `ifl-roof` with no
`ifl-mods` (a 1.10/1.11 page's memory) means "ask again" for Chats (as `hubReady` does for a boot app, `app.js:886-888`),
and the engine is never made before `mods` is known. `applyHub("no")` (degrade) releases the service too.

**S3-D13. Phones only, as Chat is.** On a computer the core never starts; the Chats screen shows "Chats is on your
phone" with a code to scan for this link (`qr.js`, as `notAvailable`, `12307-12320`); facade state `device` (Today shows
names, no words, as now). The device test is `pigeon/theme.js`'s rule, copied into `chats.js` and pinned to it by a
source-parity case in `roofcontract` (theme.js is a classic script and stays untouched).

**S3-D14. The app lock covers every surface showing Chat data, from the first call.** `service.js` reads
`inflight-lock` (`LOCK_KEY`) before its first call and starts the core with `start({ visible, locked, screen })`; **the
core starts locked by default** and stays so until `start`/`lock(false)` says otherwise (risk B4). Locked: the core
answers `waiting`/`since`/`search`/`open`/`rows` lines with nothing and patches `state: "locked"`; it drops every
`chat:*` and `typing:*` value (patch `null`); the module shows its lock screen (`lock.js`, the passkey UV check in the
page as `lockCheck` `10498-10505`, a privacy veil not a cipher, said in the code); Today clears `.dw-said`/`.dt-said`
and calls `day.js forgetHeard()` (one new export clearing `heard`/`wroteHeard`); the Chats search groups go. Veil on
hide as `10525-10536`. Setting the lock up is on Chat's own page (S3-D8), same origin, same key.

**S3-D15. Versions.** Chat keeps `APP_VERSION`/`APP_NEWS` (CLAUDE.md). `pigeon/roof/chats.js` exports `BUILD`/`NEWS`
equal to them (pinned by `roofcontract`), `IFL.built("chat", …)` once on mount (the frame does it with `R.id`),
`watchVersion` asks `/chats/version` (`_middleware.js:110`), D21 stale rules hold. Bumps at I: Chat +0.01 (1.70 if
nothing else moved it) with `APP_NEWS` naming what's new **and what changed inside InFlite** (build I16: no pull to
refresh, sync every 15 s; no swiping between Chats and Friends; Chat's Appearance only at chat.inflite.ai; hold menus
are sheets), Today +0.01 over whatever stages 2 and 4 left, with NEWS. Weather/Fitness/Markets/Mail/Account untouched.

**S3-D16. The tab bar takes InFlite's indigo.** Under `.ifl-tabs.has-pill`, `--ifl-tab-on` is set from InFlite's own
accent (`[data-app="inflite"]` `--acc-ink`, indigo `#5a4fe0` / its dark-mode value), scoped to the tab bar so it does
not change with `html[data-app]` (build I6). One token, every screen. The `roofnav` pixel-equality check (S1 §10.2)
becomes "framework Today vs framework Chats". Milestone-1 hub pages still draw menu.css's blue (only seen with an app's
roof off). "Follow the screen" stays George's question 1.

**S3-D17. How a chat scrolls** (build B4). The list and Friends scroll the window like any screen. A chat calls
`fw.fill(true)` on show (S1 D20: compact header, no window scroll) and owns one inner scroller sized from
`visualViewport`, with the composer fixed under it and the tab bar `.away`. The scroller starts at the bottom, keeps
stick-to-bottom (`S.stick`, `5093`), anchors when `older()` adds messages above, and remembers per chat (in module
memory) the message at its top for coming back. The frame neither saves nor restores window scroll for a route with a
`stay` key (S3-C7). `hide()` calls `fw.fill(false)`.

---

## 2. What you see

### 2.1 Screens, states and header

| Route / state | Screen | Header (`#hd`) | Tab bar |
|---|---|---|---|
| `/chats/` | Chats section: In the Air strip (pigeons on), pinned then recent chats and groups with unread counts, a requests banner, the "your key doesn't match" warning (`myKeyWarn`) | **tab-screen style**: your photo (InFlite's menu, S1 D24), no crumb, title "Chats", line "2 unread · 1 in the air", switcher **Chats · Friends**, acts: New Chat, Chat Settings (Search is the frame's own) | Chats current (`aria-current=page`), unread badge |
| `/chats/#friends` | Friends: friends' news, friends, groups, blocked count; Add Friend button | as above, Friends selected | Chats |
| `/chats/#open=<id>` | a chat or group: messages, flights, cards, reactions, the composer | **Back** "Back to Chats", title = name, line = online / last seen / "lands in 12m", no switcher (`sections: false`), act: Info | `.away` (the composer is up); Back is the way out |
| first run, no friends | "Add a friend to start" + your link (Chat's empty list) + Add Friend | as the root | Chats |
| `signin` (InFlite signed in, no Chat token) | "Sign in to Chats" + Sign In (the sign-in trip) | as the root | Chats |
| `key` | "Unlock Chats on this phone" + Unlock Chats (S3-D8) | as the root | Chats |
| `locked` | Chat's lock screen inside the Chats screen | root header, no acts | Chats |
| `ended` (401 mid-session) | "You’ve been signed out of Chats" + Sign In | root header | Chats |
| `offline`, nothing cached | `ui.empty` "No signal. Your chats will show when you’re back online" | root header | Chats |
| `device` (computer) | "Chats is on your phone" + code (S3-D13) | root header | Chats |
| the Worker fails to start, or `fw.service()` rejects | `ui.error` "Chats couldn’t open" + Try Again / Open Chats on Its Own (→ `links.chat`), as Weather's | root header | Chats |

**Tab and Back rules** (HOST, build I4; S3-C4): (a) cold Back from `/chats/#open=<id>` (depth 0, a push tap) goes to
`/chats/` (an app with `R.tab` backs to `R.path`, not `/#apps`); (b) Today/Chats/Apps/You switch with the tab cross-fade
(`kind: "tab"` whenever both routes are tab screens, the Chats root included); (c) `TAB_SCREENS` includes `chats` while
Chats is on, and its taps go in-page; on the list, tapping Chats scrolls to the top; (d) inside a chat the tab bar is
away, so Back (sheets first, then the chat, S1 §3.4) is the way out; (e) the root route has no crumb. The framework toast
sits above the composer while the tab bar is away (a `roof.css` rule).

### 2.2 Sheets (`fw.sheet.open`, `data-sheet` names fixed in `roofhooks`; openers frozen in B0)

Every sheet is S1 §3.8's, with no history entry (S1 D22); each is opened through an exported opener in the file that
owns its content (S1 RB5c), and `chats.js`/`chat.js` call lazy openers only through `fw.lazy`.

| File | Openers (each returns the sheet handle) | `data-sheet` |
|---|---|---|
| `list.js` (static) | `openNewChat(ctx)`, `openNewGroup(ctx)` | `newmsg`, `newgroup` |
| `friends.js` (static) | `openRequests(ctx)`, `openAddFriend(ctx, handle?)` | `requests`, `addfriend` |
| `send.js` | `openSend(ui, svc, { card, words, to }) → Promise<{ ok, say } \| { ok: false, why }>` | `send` |
| `sheets.js` | `openFriendInfo(ctx, id)`, `openGroupInfo(ctx, id)`, `openGroupAdd`, `openGroupRename`, `openSafety(ctx, id)`, `openWhoHas`, `openView(ctx, msgId)`, `openSchedule`, `openTimeTalk(ctx, id)`, `openFromApps(ctx, id)`, `openHold(ctx, target)` (hold menus as action sheets) | `friendinfo`, `groupinfo`, `groupadd`, `grouprename`, `safety`, `whohas`, `view`, `schedule`, `timetalk`, `fromapps`, `hold` |
| `flight.js` | `openFlightLog(ctx)`, `openPassport`, `openMap(ctx, msgId)`, `openSkies`, `openLookUp`, `openWay(ctx, id)`, `openMoonPick(ctx, which)`, `openBirds`, `openBird`, `openBirdName`, `openLoft(ctx, id?)`, `openFeathers` (Coots), `openNews` (friends' news) | `flightlog`, `passport`, `map`, `skies`, `lookup`, `way`, `moonpick`, `birds`, `bird`, `birdname`, `loft`, `feathers`, `news` |
| `media.js` | `openGifs(ctx, id)`, `recordVoice(ctx, id)`, `pickPhoto(ctx, id)` | `gifs`, `voice` |
| `scan.js` | `openScan(ctx)` | `scan` |
| `settings.js` | `openChatSettings(ctx, page?)` (§2.6) | `chatsettings` |

`ctx = { fw, svc, store, open }` (`open.*` = the bound openers, as Weather's view `ctx`). Not carried: `appearance`,
`moved`, `notifications` (§2.6).

### 2.3 Deep links that must keep resolving

| Link | Today's source | Stage 3 |
|---|---|---|
| `/chats/`, `/chats/index.html`, `/chats` | tab bar, Apps, cards | framework (`/chats` 301 → `/chats/` + search) |
| `/chats/#open=<id>` | pushes (`_notify.js` `/pigeon/#open=` → root SW `openAt`, IFL `sw.js:248-265`), Today rows (`app.js:1342`), `IFL.here("chat")` | that chat (unknown id → list + toast "That chat isn’t on this phone") |
| `/chats/#requests` | friend-request push button | Friends + Requests |
| `/chats/#account`, `#settings`, `#flightlog` | You's Chat Settings (`app.js:1288`), old links | Chat Settings / Flight Log |
| `/chats/#share=…&card=…&back=…` | `IFL.hub.send` when not ready (`menu.js:542`) | Send sheet (S3-D7), then `back` |
| `/chats/#add=<handle>` | friends' links | Friends + Add (signed out: kept for after sign-in, `keepAdd`) |
| `/chats/#signin-start&then=`, `#signin=…`, `#verify=`, `#invite=`, `#reset=` | sign-in trip, emails (unchanged) | hop to `/chats/in/` + same hash (S3-D8) |
| `/chats/in/…` | new | Chat's own page, always (roof on or off) |
| `/chats/?engine=1` | milestone-1 hub pages | Chat's own page (engine), always |
| `/chats/tracker.html`, `/chats/<file>` | Chat Live, files | forwarded as now |
| `chat.inflite.ai/*`, `georgefarrowgreen.com/pigeon/*` | | unchanged |

### 2.4 Search (on this phone only, S1 D16)

`connectors.js chatsProvider(F)` is the frame's own (never `fw.search.provide`, so Weather's Places provider is not
switched off, build I15), registered once the service is `ready` and unlocked, off when locked or signed out. There is
**no second search field** in the list (build I8): the frame's Search finds everything, and opened from the Chats screen
its People and Messages groups come first.
- **People** (order 15; 5 on the Chats screen): friends and groups whose name matches, avatar, sub "Chats", href
  `/chats/#open=<id>`. Names only.
- **Messages** (order 16; 6 on the Chats screen): `svc.call("search", q)` over messages already on this phone (the
  opened chats and the kept cache, as `searchMessages`), newest 8; title = first name or group, sub = a 90-character
  snippet around the match; `run` opens that chat at that message (the message id stays in the Worker as a result
  token; never in a URL). Drawn with `textContent`; the query crosses to the Worker by `postMessage` only.
- **Apps provider** gains "Chats · Friends", "Chat Settings" (`/chats/#settings`), "Flight Log". Today's own "Waiting
  for you" entries stay (`app.js:1342`).

### 2.5 Today cards and notifications

- Chat's Today card and Waiting for You: unchanged server card (`functions/_todaychat.js`); the words come from the
  facade's `waiting`/`since`. Today's first paint never waits for them; the service starts at idle (where `app.js:1203`
  made the engine) and loads only `service.js` + the core graph, not the Chats UI.
- Notifications: unchanged senders and bodies (`_notify.js` 290-510; never message words). Root SW push path unchanged
  (`sw.js:204-242`). Taps: `/chats/` and `/chats/index.html` join `FRAMEWORK` and `ROOF_DOCS` (S2's `MODS` list) so a
  tap with the framework open routes in-page: `#open=<id>` → that chat, `#requests` → Requests, else the list. With
  Chats off, the tap navigates to milestone 1's page as now.
- Badges: the Chats tab shows the unread count (a number only) through `fw.tabs.badge(n)` from the core's `unread`
  patch; the Home Screen badge stays the SW's.

### 2.6 Settings: what moves

| Was in Chat (`vAccount` `5450-5504`) | Under the roof |
|---|---|
| Pigeons on/off, New Chats Start As, Pigeon Death; Today's Pigeons (loft), Your Pigeons, Flight Log, Coots | **Chat Settings sheet** (`settings.js`), from the Chats header act, You's Chat row (`/chats/#settings`), Search |
| Location (profile place, auto location, Moon/Mars) | a page of Chat Settings |
| Privacy & Security (Encryption & Safety Numbers, Passkeys, Sessions, Blocked, App Lock) | **one row linking to Chat's own page** `/chats/in/#account` (S3-D8) |
| Notifications | already You's (`you.js:108-114`); not repeated |
| Appearance (`inflight-theme`) | dropped inside InFlite (InFlite's own appearance applies); chat.inflite.ai keeps it (S3-Q3) |
| Map & Weather Data credits | a row at the foot of Chat Settings |

Per-friend privacy toggles (`7597-7599`, Share My News, Approximate Location, Live Tracker) are `me` settings and stay in
the sheet (`core.meta("me", patch)`).

---

## 3. Module architecture (MAIN `pigeon/roof/`)

### 3.1 Files (owner batch in brackets)

| File | Static/lazy | What |
|---|---|---|
| `chats.js` [UI-A] | entry | `CONTRACT=1`, `BUILD`, `NEWS`, `PROTOCOL`, `SECTIONS=[["chats","Chats"],["friends","Friends"]]`, `mount(root, fw)`: gets the service (`fw.service()`, never imports `service.js`), makes the store, builds `section.ch-sec[data-sec]` ×2 and the chat host, wires topics to views, header specs, device rule (S3-D13), `show/hide/back/busy/sendable/unmount` |
| `connector.js` [UI-A] | static, no imports, ≤ 4 KB | §5.3 |
| `service.js` [CORE] | loaded only by the frame (`REGISTRY.chats.service`) | makes the Worker (the only file under `pigeon/roof/` that does), RPC + protocol handshake, the store feed, the facade (S3-D6), `ui.on("push")` relay, restart on `visible` if the Worker died; exports `startService({ path, ui, onStale })` |
| `core.js` [CORE] | Worker entry | S3-D3/D5; imports `./idb.js ../crypto.js ../cards.js ../digest.js ../links.js`; `../rank.js` dynamically (Send only, build I1) |
| `idb.js` [CORE] | core graph | the one IDB file (S2 C5): `inflight`/`kv` get/set/del, Web Locks wrapper, `gone` guard |
| `store.js` [UI-A] | static | `createStore() → { get(topic), on(topic, fn) → off, apply(patch), clear(prefix) }` |
| `list.js` [UI-A] | static | Chats section (`vMessages` `5345`), In the Air strip (the map is lazy), the 1 s ticker for rows, `openNewChat/openNewGroup` |
| `friends.js` [UI-A] | static | Friends section (`vFriends` `5426`), `openRequests`, `openAddFriend` |
| `chat.js` [UI-A] | static | a chat/group (`vChat` `6695`, `vGroupChat` `6648`, message `5665-5804`), composer (`6768-7033`), S3-D17 scroller, keyboard via `visualViewport` (removed on hide), the 1 s ticker for the open chat, draft flush on `hidden` (risk I10) |
| `lock.js` [UI-A] | static | lock screen and veil (S3-D14) |
| `send.js` [UI-B] | lazy, kept offline | S3-D7 |
| `sheets.js` [UI-B] | lazy, kept offline | §2.2 row |
| `flight.js` [UI-B] | lazy, network-only | §2.2 row; imports `../moon.js ../space.js ../land.js ../placegrid.js ../places.js ../countries.js ../shapes.js` |
| `media.js` [UI-B] | lazy, kept offline | photos, voice pigeons (`10538-10641`, `MediaRecorder` in the page, the `Blob` sealed in the core; object URLs made and revoked here), GIFs (`10385-10487`, results network-only) |
| `scan.js` [UI-B] | lazy, network-only | QR scan (`3430-3489`) + `../jsqr.js` |
| `settings.js` [UI-B] | lazy, kept offline | Chat Settings (§2.6) |
| `chats.css` [UI-A] | linked | shell, lists, chat, bubbles, composer, lock (from `styles.css` 283-917 and the Messages/chat rules), re-tokenised, under `.m-chats` |
| `chsheets.css` [UI-B] | linked | sheets: friend/group info, flight log, passport, Moon, map card, GIFs, voice, settings, Send (`styles.css` 918-1596, 2269-2564), under `.ifl-sheet[data-app=chats]` |
| `../cards.css` | linked | card looks (`cd-*`), reused |

Never the generated blocks of `styles.css` 2665-3039.

### 3.2 State and redraw

- **No global `S`, no `render()`.** The core owns the state; it emits `{ t: "patch", topic, data }` for topics `state`
  (`ready|signin|key|locked|device|offline|ended`), `me`, `rows`, `friends`, `groups`, `requests`, `air`, `chat:<id>`
  (only the chat the page `open`ed), `typing:<id>`, `outbox`, `send`, `keywarn`, `unread`. Shapes frozen in §5.5.
- `store.js` keeps the last value per topic and calls subscribers in a microtask; **a `null` value deletes the topic**.
  The core sends `chat:<id> = null` and `typing:<id> = null` on `leave()`, on `locked` and when it drops plaintext after
  10 min hidden; the store also runs `clear("chat:")`, `clear("typing:")` and blanks `rows` lines on `locked` and on
  unmount (risk I2). So the page holds at most the chat on screen.
- Each view subscribes to what it draws and patches its own region, keyed like Chat's keyed redraw (`data-key`,
  `4914-5135`), in one `requestAnimationFrame` per view; views unsubscribe on `hide()` and resubscribe on `show()`.
- Page-only state (composer text, attach, scroll, `S.next` choice) lives in the view that owns it. `busy()` = composer
  has text, recording, sending, a module sheet open, a voice note playing (`12506-12509`).

### 3.3 DOM and events

- Every lookup is `root.querySelector` or an element the module made (S1 §5.1 greps); Chat's `$` helper is bound to
  the module root. The bird `<symbol id="bird-path">` is stamped once inside the module root.
- `onClick1` (`9414-10384`, ~270 cases) is split into one delegated `click` handler per view and sheet, each a `switch`
  over its own `data-act`s; no handler on `document`. Chat's `toast(esc(html))` calls become `fw.toast(text)`: never
  HTML (build I16).
- Window/document listeners only with removal in `hide()`/`unmount()`: `visualViewport` resize (chat),
  `online`/`offline` (forwarded to the core). Tab swipes, pull to refresh, the back-edge, Chat's own menus and toasts,
  `mount()`/`go()` (`4052-4913`) are not carried (S1 D19).

### 3.4 Lifecycle

`mount`: `fw.service()`, subscribe, draw skeleton rows from the core's cached list at once. `show(route)`: section;
`#open` → `call("open", id)`; sheet keys → open sheet; `call("start", { visible: true, screen: true })`; timers on
(S3-D10). `hide()`: timers off, keyboard closed, `call("leave")` (stops the pulse, unmarks the open chat, drops its
plaintext topic), `fw.fill(false)`. `unmount()` (roof off): unsubscribe, timers off; the service is kept for Today
unless the frame terminates it (sign-out, user change, roof off: `F.releaseService("chats", { terminate: true })`).

---

## 4. Framework, Today and You changes (IFL; batch HOST)

### 4.1 `today/public/roof/`

- `router.js` (B0, ❄): `REGISTRY.chats` (§5.1); `skip` rules: `/chats/in/…` and any `/chats/` URL whose query has
  `engine` are not ours (`null`); route gains `hash` (raw, ≤ 7000 chars) only for keys in `R.raw`; `stay` as S4 C2.
- `frame.js`: (a) an app with `R.tab` is a tab screen at its root route (tab-screen header: photo, no Back, no crumb,
  switcher kept; `F.tabs.set(R.tab)`); an inner route (a `stay` key) gets Back "Back to <Name>" and backs cold to
  `R.path`; (b) `F.service(app)` → facade, `F.releaseService(app, { terminate })`, `fw.service()` → full service
  (S3-C3), awaiting `opts.retired` (risk I11); (c) `fw.tabs.away(on)`, `fw.tabs.badge(n)` (S3-C4); (d) the root SW's
  `{inflight:"sync", tag}` (the existing `navigator.serviceWorker` listener, `frame.js:446`) is relayed to
  `fw.on("push", fn)` subscribers as `{ app: "chats", tag }` (S3-C5); (e) the stale reload waits for `!F.busy()` and
  no window scroll is saved or restored for a `stay` route (S3-C7); (f) `setRoof(on, "chats")` per S2 C3.
- `tabs.js`: `TAB_SCREENS` gains `chats` when `F.session.mods.chats`; tab transition kind; `badge`; `away`;
  `--ifl-tab-on` = InFlite indigo (S3-D16).
- `modules.js`: `IFL.built(R.id || app, …)` (`:44`); `loadService(app, F)` (import `R.service` plain, `startService({
  path: R.path, ui: F.forModule(app), onStale: () => (F.stale = true) })`, one shared promise per app in
  frame state); `preload` uses `connector.preload ?? files` (S3-C1: Chats preloads only the entry and `connector.js`,
  because its graph is fetched under stamped URLs, risk I12); `keepOffline(app, build, [...files, ...lazy])` (S2 C4).
- `connectors.js`: Chats' `connector.js` when on (S2 C2's `connectorOf` rule); `chatsProvider(F)` (§2.4);
  `places()` checks only Weather's providers (build I15).
- `roof.css`: tab-bar token (S3-D16), toast above the composer, `.ifl-tab-badge` on the Chats tab.
- Budget: `roof/*.js` ≤ 24 KB gz, raised in **stage 2's B0** (build I14; recorded in `roofui.test`). Stage 3's share
  ≤ 2.5 KB; if 24 KB doesn't hold it, HOST raises it to 25 KB and records why.

### 4.2 `today/public/app.js`, `you.js`, `day.js`

- `heard/askHub/hubReady` read `mods.chats` (S2 C3; `ifl-mods`). `chatsHere` = Chats on at boot (S3-D12); a bare
  `ifl-roof` without `ifl-mods` → ask again before anything Chat-related.
- First line of `start()`: the `#signin…` hop (S3-D8). **Sign In hrefs unchanged.**
- `chatsHere`: `IFL.hub.chat = () => F.service("chats")` synchronously at boot and in `applyHub` (S3-D6); the idle
  engine make (`:1203`) becomes `F.service("chats")` (signed in, not a computer). Off: the original back,
  `F.releaseService("chats", { terminate: true })`. `applyHub("no")` releases it too (S3-D12).
- `retireOld()` (S2): with Chats on, unregister registrations whose scope path is `/chats/`, **before** the service
  starts: its promise is `opts.retired` (risk I11).
- Sign-out (risk I3): `signedOutNow()` (`:1166-1174`) and `signedIn` with a different `user.id` call
  `F.releaseService("chats", { terminate: true })`; `signOut()` (`:1135-1143`) awaits `facade.signOut()` (the core's
  `signOut` + `forget`) and then the terminate **before** `forgetApps`.
- `chatSettings` (`:1288`) → `F.nav.go("/chats/#settings")` with Chats on.
- On the service's state turning `locked` (the frame calls the host's `opts.serviceState(app, state)` on every
  `state` patch, S3-C3): clear `.dw-said`/`.dt-said` in `#today`, call `day.js forgetHeard()` (S3-D14).
- `day.js`: one export `forgetHeard()`; nothing else.
- `you.js`: Chat row line "Pigeons, privacy and your loft"; Connected Apps' Chats row from the connector.
- Preload (S1 D2's rule, S2 per-app `preload(app)`): at idle after Today's first paint, `connector.js`, then
  modulepreload of `connector.preload` when `localStorage["ifl-build:chat"]` exists; otherwise on `pointerdown`/`focus`
  of the Chats tab. Nothing new in `index.html`.

---

## 5. Contracts

### 5.1 REGISTRY entry (S3-C1 CONTRACT CHANGE: new optional fields `tab`, `id`, `raw`, `service`, `skip`; uses S2 C2's `link`/`idb` and S4 C2's `stay`)

```js
chats: { app: "chats", id: "chat", name: "Chats", path: "/chats/", tab: "chats", link: "chat", idb: "inflight",
  entry: "/chats/roof/chats.js", connector: "/chats/roof/connector.js", service: "/chats/roof/service.js",
  css: ["/chats/roof/chats.css", "/chats/roof/chsheets.css", "/chats/cards.css"],
  sections: [["chats", "Chats"], ["friends", "Friends"]],
  aliases: { open: "chats", settings: "chats", account: "chats", flightlog: "chats", share: "chats",
             requests: "friends", add: "friends" },
  stay: ["open"], raw: ["share"], skip: { paths: ["/chats/in/"], query: ["engine"] } }
```
`roofrouter.test` pins it; `format({ app: "chats", key: "open", arg })` → `/chats/#open=<id>`; `parse("/chats/#add=pat_1")`
→ `{ section: "friends", key: "add", arg: "pat_1" }` (ids are 36-char UUIDs, handles fit `ARG`). Connector gains an
optional `preload: string[]` (default `files`).

### 5.2 Module contract v1, as Chats uses it

Unchanged exports and instance (S1 §5.1). `show(route)` handles `route.key`/`arg`/`hash`; `back()` returns true when it
closed a module overlay; `sendable()` → null (Chats sends, it isn't sent).
- **S3-C2 CONTRACT CHANGE (amends S2 C5).** `REGISTRY[app].service` names one file that may make one `Worker` at load
  (outside `fw.lazy`). That Worker's graph may open `REGISTRY[app].idb` only through `<app>/roof/idb.js`, and its entry
  may use `self.addEventListener`/`self.postMessage`. The Worker graph (`core.js`, `idb.js`) is checked by its own grep
  set: no `document`, `window`, `localStorage`, `fw`, `location` writes, `serviceWorker`, `unlock(`/`vaultWith`/argon2;
  dynamic `import(` only of `../rank.js`. The page grep set (S1 §5.1) applies to every other `pigeon/roof/*` file, plus:
  no `from "./service.js"` and no `import("./service.js")` (risk B2). Greps are scoped to `pigeon/roof/*`; the reused
  `../crypto.js` (its nested Argon2 worker, `crypto.js:58`) is exempt by name.
- **S3-C3 CONTRACT CHANGE.** Host: `F.service(app) → Promise<Facade>` (frozen seven keys, any state),
  `F.releaseService(app, { terminate })`; module: `fw.service() → Promise<Service>` (own app only); `createFrame(opts)`
  gains optional `opts.retired: Promise` and `opts.serviceState(app, state)` (called on each `state` patch); the service file exports `startService({ path, ui, onStale })
  → Service`. One service instance per app per page, held in frame state (never on `globalThis`).
- **S3-C4 CONTRACT CHANGE.** `fw.tabs.away(on)` (the existing `.away` state, `roof.css:113`), `fw.tabs.badge(n)` (own
  tab only); an app with `R.tab` is a tab screen (§2.1 rules a–e).
- **S3-C5 CONTRACT CHANGE.** `fw.on("push", fn)`: the root SW's `{inflight:"sync", tag}` relayed by the frame as
  `{ app: "chats", tag }` to the Chats `fw` only.
- **S3-C6.** None to `header.set` beyond S4 C3's `sections: false`, used by the chat route.
- **S3-C7 CONTRACT CHANGE (D20/D21 behaviour).** The stale reload (`frame.js:457`) also requires `!F.busy()`; a route
  whose key is in `R.stay` gets no frame window-scroll save/restore.

### 5.3 Connector (`pigeon/roof/connector.js`)

```js
export const CONNECTOR = 1;
export const connector = { app: "chats", name: "Chats",
  shares: { cards: "Who’s waiting for you, and letters on their way",
    search: "Your friends and your messages, on this phone only",
    notifications: "New messages and letters as they land, never their words",
    actions: "Open a chat; send a card to a friend",
    screens: "Chats · Friends" },
  sections, aliases,
  files: [ /* static graph of chats.js + core graph of core.js (rank.js excepted) + the 3 CSS */ ],
  lazy: ["/chats/roof/send.js", "/chats/roof/sheets.js", "/chats/roof/settings.js", "/chats/roof/media.js"],
  preload: ["/chats/roof/chats.js", "/chats/roof/connector.js"],
  mini(answer) { /* answer.cards.chat: { kind: "num", num: String(unread), label: "Unread" } or null */ } };
```
No `search` here (it needs the core; §2.4 is the frame's provider). `files ∪ lazy` ≤ 60. `flight.js`, geodata,
`jsqr.js`, `scan.js` and GIF results are network-only ("Needs a connection"). `roofcontract` walks both graphs.

### 5.4 The core's RPC (frozen allow-list; anything else → `{ err: "no" }`)

Page → core `{ id, m, a }`; core → page `{ id, ok: true, v }`, `{ id, ok: false, why }` and `{ t: "patch", topic, data }`.
`why` ∈ `signin | key | locked | device | offline | ended | tap | card | trust | failed | no`.
- Life: `hello(protocol)`, `start({ visible, locked, screen })`, `state()`, `lock(on)`, `signOut()`, `forget()`.
- Reading: `sync({ quiet })`, `open(id)`, `leave()`, `older(id, before)`, `rows(from, to)`, `search(q)` (q ≤ 100
  chars), `waiting({ ids, stocks })`, `since(id, t)`, `photo(msgId) → Blob`.
- Sending (sealed in the core): `sendText(id, text, { way, kind, replyTo, at })`, `sendBlob(id, blob, kind)`,
  `note(id, msgId, text)` (stopover note, `10263`), `react(id, msgId, emoji)`, `recall(id, msgId)`, `read(id)`,
  `draft(id, text)`, `share(card, words) → rows`, `rank(card)`, `sendRun(spec)`.
- Trust (public keys only): `safety(id) → { digits, verified, keyChanged }`, `verify(id, on)`, `trust(id)`
  (`trustNewKey`, accepting a changed key; risk B5).
- Metadata: `meta(name, args)` for a frozen table `META` of endpoints that carry no message words, each with method
  and argument checks: `me` (GET, PATCH settings), `friends` (add), `friends-respond`, `friend-status`, `block`,
  `mutuals`, `groups` (create), `group-add`, `group-name`, `group-leave`, `group-mute`, `flight-log`, `loft`,
  `feathers`, `feathers-buy`, `bird-wear`, `bird-retire`, `skies`, `wind-grid`, `route-plan`, `wx-plan`, `way`, `wave`,
  `news`, `gif-search`, `time-offer`, `together`, `fit-offer`, `fit-share`, `card-now`, `my-card`, `share-rank`. B0
  writes the table from `app.js`'s call sites; any endpoint whose body holds `ct`/`iv`/text, pins, vault, passkey, salt,
  resume, reauth, sessions or logout is **not** `META`.
- `PROTOCOL` = one integer, equal in `chats.js`, `service.js` and `core.js` (pinned); a mismatch makes the service call
  `onStale` (S1 D21 boundary reload).
- A `roofchatcore` RPC-table test: no method's result contains a key named `d`, `kty`, `token`, `ct` or `iv`.

### 5.5 Data shapes across the boundary (frozen by B0 as JSDoc typedefs in `core.js`'s header, fixtures in `unit/fixtures/chats.mjs`)

- `Row { id, kind: "friend"|"group", name, avatar, unread, flying, pinned, at, keyChanged, line? }` (`line` only for
  rows in the asked window).
- `Friend { id, handle, name, avatar, online, lastSeen, place?, keyChanged, verified, blocked }` (`place` only where
  the friend shares it and it is shown today); `Group { id, name, members: [{ id, name }], muted }`; `Request { id,
  handle, name, at, dir: "in"|"out" }`; `Me { id, name, handle, avatar, pigeons, startAs, death, place?, feathers }`;
  `Air { id, chatId, kind, from, to, landsAt }` (no words, no place names beyond what the list shows today).
- `Msg { id, from: "me"|"them"|<memberId>, at, kind: "text"|"photo"|"voice"|"card"|"ask"|"plan"|"answer"|"when"|
  "viewonce"|"system", text?, flight?: { flying, landsAt, lost, waiting, way, pigeon }, replyTo?, reactions: {
  [emoji]: n, mine? }, read, delivered, recalled, expires?, card?: <normCard>, media?: { ref, kind, secs? }, postmark? }`;
  `chat:<id> = { id, kind, msgs: Msg[], older: boolean }`.
- `typing:<id> = { on: boolean }`; `outbox = [{ id, chatId, state: "queued"|"sending"|"failed" }]` (no text);
  `keywarn = { mine: boolean, friends: [id] }`; `unread = n`; `send = { id, step, why? }`.
- Returns: `open` → `chat:<id>`; `older` → `{ added: n, older }`; `sendText`/`sendBlob` → `{ id }`; `share` →
  `Row[]` ranked; `search` → `[{ token, chatId, title, sub, at }]`; `safety` as §5.4.
- B0's stub core (`.tools/tests/roofkit/chatcore-stub.js`, a Worker answering every RPC from the fixtures) is what UI-A,
  UI-B, HOST and Q build against; `roofchatservice.test` checks that the real core's answers match the fixture shapes.

### 5.6 Import graph and transfer budget (build I1)

- Page static graph: `chats.js connector.js store.js list.js friends.js chat.js lock.js` + `../cards.js ../cardview.js
  ../links.js` + CSS `chats.css chsheets.css ../cards.css`. Service: `service.js`. Core graph: `core.js idb.js
  ../crypto.js ../cards.js ../digest.js ../links.js`. Lazy only through `fw.lazy` (page) or the core's one `import`.
- **Budgets, first Chats open, gzip of the served minified files**: page JS ≤ **110 KB**; CSS ≤ **28 KB** total; core's own
  code (`core.js` + `idb.js`) ≤ **36 KB**; core graph ≤ **55 KB**; **Today's idle start** (`service.js` + core graph)
  ≤ **58 KB** (the engine costs ≈ 270 KB). No URL fetched twice. CORE and UI-A record the measured figures in their
  logs from the first build (`roofchats` part 10 asserts them at I); a miss is raised with its reason by the batch, not
  at I.
- Performance: list from the cached rows ≤ 400 ms after the files are in; opening a cached chat ≤ 300 ms; warm
  tap→paint of the Chats tab ≤ 600 ms.

---

## 6. Server and hub (batch SV)

### 6.1 `/api/hub`

S2 C3's `mods` gains `chats: roofOn(env, "chats")` (`roofOn` = `ROOF_OFF !== "1" && ROOF_OFF_CHATS !== "1"`); `roof`
stays Weather's.

### 6.2 `today/src/roof.js` + `hub.js`

- `MODS` gains `chats`; `modOf(path)` returns `chats` for `/^\/chats\/(index\.html)?$/` **only when the query has no
  `engine`**, never for `/chats/in/`.
- `hub()`'s read branch, Chats on: doc → `roofPage`; `/chats/sw.js` → `retireWorker(request, "chats")`; off →
  `/chats/roof/*` 404 no-store. `/chats` → 301 (`:142`) unchanged.
- `RETIRE_SW("chats")`: deletes caches `inflight-shell*` (`pigeon/sw.js:11`), unregisters, then posts `{ifl:"route"}` to
  windows at exactly `/chats/` or `/chats/index.html` and navigates only those that don't answer `{ifl:"routed"}`
  within 1 s (as `openIn`, `sw.js:284-296`); never a window at `/chats/in/` (risk I11).
- `PAGE_HEADERS` and `_headers` `/*` (one CSP, test-compared): add `media-src 'self' blob:` (voice pigeons);
  Permissions-Policy `camera=(self), microphone=(self), geolocation=(self)` (QR scan `3435`, Look Up `9043-9060`, voice
  `10588`); was `camera=(), microphone=()` (`roof.js:21`, `_headers:34`). No `'wasm-unsafe-eval'`: Argon2 never runs in
  the framework page or its Worker (S3-D8). Merged with stage 4's C7 additions if those landed.

### 6.3 Root service worker (`today/public/sw.js`)

- `MODS`-driven `ROOF_DOCS`/`FRAMEWORK` include `/chats/`, `/chats/index.html`; `roofDoc` and `FRAMEWORK` skip any
  `/chats/` request whose search has `engine`, and `/chats/in/` is never a framework window (risk I11, build I17).
- `KEEP_APPS` gains `chats`; its keep list accepts `/chats/roof/*` and `/chats/<name>.(js|css)` plain paths, never
  `sw.js`, `version`, `in/`, `tracker*`, `handover*`.
- `moduleFile` for `/chats/`: plain path or search exactly `?v=<12 hex>`; the kept copy is matched **by pathname** in
  `roof-chats-*`. Network first; a 404 passes through.
- Push/pulse/badge code unchanged (`:204-242`).

### 6.4 MAIN (batch SV)

- `functions/_app.js` `stampImports` (S3-D1, `/roof/` files only). `functions/_middleware.js` `/_hub/in/` (S3-D8).
- `pigeon/app.js`: the S3-D8 `/pigeon/in/` block. (`APP_VERSION`/`APP_NEWS` at I.)
- No API change. `_todaychat.js`, `_notify.js`, `functions/api/pigeon/*` untouched.

---

## 7. Offline

Online once since the last Chat release (Home Screen mode, S1 D11): `/chats/` opens from the kept `/`, the module and
core from `roof-chats-<BUILD>` (`files ∪ lazy`), the list and the chats you opened from the core's ciphertext cache
(decrypted in the Worker), sending queued in the sealed outbox (`outboxLoad/Flush`, `10651-10700`). Friend info, safety
numbers, Chat Settings and the Send sheet work offline (`connector.lazy`, build I9); the map, Moon, Look Up, GIFs and
scan say "Needs a connection". "No signal" banner from the `offline` state. Chat's old `/chats/` worker is retired
(§6.2) and unregistered by the page before the core starts (§4.2).

---

## 8. The rollback switch (per app, reusing roof.yml)

- **Secret** `ROOF_OFF_CHATS = "1"` on `inflite` and `inflite-next`; `ROOF_OFF = "1"` still turns every module off.
  `/api/hub` `mods.chats: false`; the hub serves milestone 1's Chats page at `/chats/` (which does sign-in itself),
  Chat's own `/chats/sw.js`, and 404s `/chats/roof/*`.
- **`roof.yml`** input `app` gains `chats` (S2 §7's form); `hub.sh wait_roof SITE want [secs] chats` reads
  `.mods.chats`; `roof_verdict` "Chats is back to its own page at /chats/". `hubstack.mjs` gains `roof-off-chats`.
- **Open pages** learn on next visible (≤ 5 min, S1 D14): Chats unmounted, core terminated, `IFL.hub.chat` back to the
  original, Chats tab navigates, and a shown Chats screen bounces once (`ifl-roof-bounce`); Weather and the other
  modules stay mounted (risk I7, `setRoof(false, "chats")`). Same data (S3-D4): no re-unlock either way; a message
  queued in the core is sent by milestone 1's page (tested, risk I8).
- Levels: 1 the switch (seconds); 2 revert the stage-3 merge on IFL `claude/inflite` + `dist7t` (Today back a build);
  3 `hub-off.yml`. **Never revert MAIN while the IFL chats rule is live: flip `ROOF_OFF_CHATS` first.** MAIN's stage-3
  files are inert without the IFL rule, so MAIN never needs reverting for a Chats problem.

---

## 9. Risks and guards

1. **The E2E port drifts or weakens.** Guard: verbatim copies incl. the trust gate and `pinsWait`, pinned by source
   parity (S3-D5); behaviour tests in node (TOFU on a fresh unlock, B3); **deep adversarial review of CORE only** (R3).
2. **A Send that skips key checks.** Guard: one sealing path (`sendRun`); the facade has no `call`; `sendTo` falls back
   to the sheet on a changed or untrusted key; the module's `fw.service()` is the only full handle.
3. **Plaintext in shared surfaces.** Guard: `chat:<id>` only for the opened chat and deleted on leave/lock; `rows`
   lines only for rows asked; locked from the first call (S3-D14); `roofchats` part 7 scans storage, URLs and the
   hostpass log for a known sentence; RPC result key test.
4. **Sign-in breaks.** Guard: links unchanged, hop only while the framework serves `/chats/`, switch restores milestone
   1's trip (S3-D8); `todayauth` run with `roof-off-chats` (Q).
5. **Two Chat instances on one IDB** (two service records, engine + core, two tabs). Guard: no module imports
   `service.js` (grep), one service per app in frame state, engine never before `mods` known, Chats turned on only at
   load (S3-D12), Web Locks (S3-D4); `roofchats` asserts `page.workers().length === 1` at each step and 0 after a 401.
6. **Worker lifetime on iOS.** Guard: state in IDB; the service re-creates the Worker on `visible` and re-sends
   `start`; calls during a restart queue for 5 s, then reject `why: "offline"`.
7. **Old `/chats/` worker controls the new page.** Guard: page unregisters before the core starts; retire script
   routes before navigating; `/chats/in/` never navigated or registered; `roofchatnav` part 3.
8. **Skew page ↔ service ↔ core ↔ server.** Guard: `PROTOCOL` in three files, `fw.lazy`, `watchVersion`, stamped
   `core.js` (S3-D1), every `pigeon/roof/*` or reused-file change bumps `APP_VERSION` (S3-D11).
9. **Budget creep.** Guard: lazy split, measured budgets from the first build (§5.6).
10. **Shared Today code regressions** (header, tab bar, `IFL.hub.chat` swap). Guard: `roofshell`, `todayshell`,
    `todaypage`, `todayphases`, `hubshare` green; deep review of the HOST diffs in `frame.js`/`tabs.js`/`app.js` (R3).
11. **Existing pushes name a friend's place** ("changed course for Leeds", `_notify.js:315,382`; "flew over …",
    `:377`) when names are on. Not changed by stage 3; flagged (S3-Q6).
12. **Memory in a page that never reloads.** Guard: store deletes on leave; 10-min drop; object URLs revoked on hide.
13. **Lost typed text on a stale reload.** Guard: S3-C7 and the draft flush on `hidden`.

---

## 10. Tests

Unit suite always; only the e2e named per batch; the integrator runs the full suite in halves on two extra sessions
(R3). Every behaviour the critiques found is a **unit** test where it can be (node, no e2e slot).

### 10.1 Unit (MAIN `.tools/tests/unit/`)

| Test | Batch | Proves |
|---|---|---|
| `roofrouter.test.mjs` (extend) | B0 | chats routes, aliases, `stay`/`raw`/`hash`, roof object, `skip` (`?engine`, `/chats/in/`) |
| `roofcontract.test.mjs` (params by app) | B0 | Chats exports; BUILD/NEWS = `APP_VERSION`/`APP_NEWS`; `PROTOCOL` equal ×3; SECTIONS = REGISTRY = connector; `files` ⊇ both graphs (no lazy file; `rank.js` excepted); `lazy` real; page and Worker grep sets (S3-C2), no `service.js` import; device rule = theme.js's |
| `roofchatcore.test.mjs` (new) | CORE | parity (S3-D5 list incl. trust gate and the `pinsWait` slice); TOFU on a fresh unlock (empty IDB, server pins A, sync B → `keyChanged`, `pins[id] === A`, `sendRun` refused); starts locked, `waiting` → [] until `start({ locked:false })`; `chat:<id>` only after `open`, `null` on `leave`/`locked`; `waiting`/`since` use `quiet=1`, no `read`; no `cache:` write before `screen`; `forget` → later writes refused; storage goldens both ways (S3-D4); outbox merge under a lock; RPC refuses unknown methods, bad arguments and non-`META` names; no result key `d/kty/token/ct/iv`; no fetch URL or header carries a message word |
| `roofchatservice.test.mjs` (new) | CORE | facade keys = `makeIFLChat`'s and frozen; no `call` on the facade; `sendTo` without a tap → `{ ok:false, why:"tap" }`; protocol mismatch → `onStale`; restart queue; `inflight-lock` read before the first call; push relay → quiet sync; real core answers match the fixture shapes |
| `roofchatviews.test.mjs` (new) | UI-A | store topics → view patches; `null` deletes; `clear` on lock/unmount; escaping; no inline styles/handlers |
| `roofchatsheets.test.mjs` (new) | UI-B | each opener draws on fakedom, escapes, no inline styles; Send's five not-ready states |
| `roofui.test.mjs` | HOST | budget; tab-screen header for `R.tab`; badge/away |
| `roofpage.test.mjs` (extend) | HOST | hop line first in `start()`; Sign In hrefs unchanged; `IFL.hub.chat` swap before first render; release on sign-out paths |
| `roofserve`, `hubworker`, `hubheaders`, `todayfiles`, `rootsw`, `todaysw` (extend) | SV | per-app docs, `?engine`/`/chats/in/` forwarded, 404 when off, retire script routes first, `mods.chats`, CSP/Permissions in both places, root SW skip rules |
| `roofchatserve.test.mjs` (new) | SV | `../` and `new URL` stamping under `/roof/` only, standalone output byte-identical, `/_hub/in/` page and files, the `/pigeon/in/` block (three behaviours) |
| unchanged green | – | `engine`, `hubchat`, `chatsonly`, `digest`, `cardview`, `cardsend`, `sharecards`, `todaychat`, `pigeondb`, `iflmenu`, `min` (red only for changed files until I) |

### 10.2 End-to-end (MAIN `.tools/tests/`), selectors only via `roofhooks.mjs`, helpers from `rooflib.mjs`

| Test | Stack | Owner | Proves |
|---|---|---|---|
| `roofchatmount.mjs` | kit page, stub core | UI-A | list, chat, composer, every state, the UI-A sheets open/close by hook; S3-D17 scroll (open, scroll up, leave, back → same message; keyboard up → last message visible); `.away`; axe; 320/390/1280 |
| `roofchatsheetmount.mjs` | kit page, stub core | UI-B | every UI-B sheet of §2.2 opens and closes by hook; Send's five states; axe; 390 light/dark |
| `roofchats.mjs` `// needs: hub` | hubstack, two phones | Q | 1 Chats tab in-page, header, accent tab, one Worker; 2 open a chat, Back, send → the other phone reads it; 3 deep links; 4 Send from Weather Now and Today's one tap (changed key → sheet), toast, one Worker; 5 Waiting words with **no iframe**, `quiet=1`, no `read`; 6 search People and Messages, query in no request; 7 storage/hostpass scan for the sentence; no `today:*` change; 8 `key` → Unlock → `/chats/in/` → back unlocked; 9 app lock **at boot** (lock set, reload Today: no `.dw-said`, no `messages?with=` before unlock) and mid-session; 10 budgets (§5.6); 11 new Chat build mid-session; 12 CSP clean, axe, 390 light/dark; 13 a 401 mid-session → 0 Workers |
| `roofchatnav.mjs` `// needs: hub` | hubstack | Q | 1 push taps (framework open and closed); 2 Chats off mid-session: Weather stays mounted, bounce, original `IFL.hub.chat`, a message queued offline in the core sent by milestone 1's page; 3 old `/chats/` worker stand-in retired without reloading a framework window, `/chats/in/` never navigated; offline Chats from cache; 4 `/chats/#signin=` hop and `/chats/in/` round trip; `/chats/in/` with a session and no sign-in → `/chats/` |
| `todayauth.mjs` (first line only) | hubstack `roof-off-chats` | Q | signs in through milestone 1's `/chats/` with Chats off |

Must change (owners): `roofnav.mjs` (tab-bar pixel check framework Today vs framework Chats; Weather→Chats in-page) Q;
`hubshare.mjs` (Send through the module with Chats on) Q; `rooflib.mjs` (`chatPhone()`, `CHAT_LAZY`) Q; `hubserve.mjs`,
`hubstack.mjs` (`roof-off-chats`) SV; `mocks/todaystub.mjs` (`mods.chats`), `roofshell.mjs`, `todayshell.mjs` HOST;
`roofhooks.mjs` (B0: `M_CHATS`, `chSec(id)`, `CH_ROW`, `chRow(id)`, `CH_BUBBLE`, `CH_COMPOSER`, `CH_SEND_BTN`, `CH_UNLOCK`,
`CH_LOCK`, `CH_SCROLLER`, `TAB_BADGE`, the §2.2 sheet names); `roofkit/**` stub core and kit wiring B0, then HOST.

---

## 11. Batches and go-live

### 11.1 Batches (R1, R3: build only what's asked; deep review only where marked)

```
B0 contracts (serial, ≈ ½ day; after stage 2 is merged into claude/one-roof-s3)
  ├─ wave (parallel): CORE (core, idb, service; DEEP REVIEW) · UI-A (entry, store, list, friends, chat, lock,
  │                   connector, chats.css, roofchatmount) · UI-B (send, sheets, flight, media, scan, settings,
  │                   chsheets.css) · HOST (roof/*, app.js, you.js, day.js; DEEP REVIEW of frame/tabs/app diffs)
  │                   · SV (hub, roof.js, sw.js, _headers, roof.yml, hub.sh, _app.js, _middleware.js, app.js block)
  │                   · Q (roofchats, roofchatnav, test changes)
  └─ I: versions (Chat, Today), minify, suite in halves, full e2e twice, golive.md
```
Merge order: SV and CORE first, then HOST, UI-A, UI-B; Q runs against the merged branch. UI-A, UI-B, HOST and Q work
against B0's stub core until CORE merges.

### 11.2 Going live (MAIN first, inert; then IFL)

1. I's checks green, including the unit suite with IFL `claude/inflite` beside (roof cases skip).
2. **MAIN → `main`**: module files inert (the live Worker has no chats rule); Chat 1.70 standalone; `/chats/in/` works
   at once through the live hub (unused until IFL). Check: CI green; `chat.inflite.ai/version`;
   `inflite.ai/chats/roof/chats.js` 200 through the hub; sign in from Today (unchanged path).
3. **Staging**: `hub-stage.yml` with the IFL branch → next.inflite.ai: `/api/hub` `mods.chats:true`; Chats tab, a chat,
   Send from Weather, Waiting words, a push tap, a sign-in through the hop; `roof.yml app=chats state=off
   where=next.inflite.ai` (sign in again through milestone 1's page), then on.
4. **IFL → `claude/inflite` and `dist7t`**: Today +0.01. Check `/api/hub`, `/chats/` framework (noindex, new CSP),
   `/chats/sw.js` retiring, `/chats/?engine=1` and `/chats/in/` Chat's page, Worker settled.
5. No other IFL branch push for a day (S1 §11.1 step 5).
6. Phone checks for George (not a gate): Chats → a chat → send and receive → Back; Send from Weather; a Chat
   notification tap; a voice pigeon and a QR scan (camera/microphone permissions); unlock on a phone that only used
   chat.inflite.ai (one tap with a passkey); Privacy & Security opens Chat's own page and comes back.

---

## 12. Questions for George (the build uses the default in brackets)

1. Tab bar colour: InFlite's indigo on every screen, or follow the screen (Chats' blue on Chats, each app's colour
   inside it)? [indigo everywhere]
2. A phone that only ever used Chat at chat.inflite.ai unlocks Chats once at inflite.ai (one tap with a passkey, else
   your password). OK? [yes]
3. Inside InFlite, Chats follows InFlite's Light/Dark; Chat's own Appearance setting stays only at chat.inflite.ai. OK?
   [yes]
4. Chat Settings stays one sheet of Chats (opened from You, from Chats' header and from Search), rather than each row
   moving into You. OK? [yes]
5. InFlite's Search finds your messages (on this phone only, over chats already on it, never sent anywhere), and the
   Chats list loses its own search box in favour of it. OK? [yes]
6. Some existing Chat notifications name a friend's place when names are on ("Your pigeon changed course for Leeds").
   Stage 3 doesn't change notifications. Leave them, or drop the place? [leave; a separate small change if you want it
   gone]
7. On a computer, the Chats tab says "Chats is on your phone" with a code to scan. OK? [yes]
8. Sending a card while Chats isn't unlocked on this phone: say "Unlock Chats, then tap Send again" rather than keep
   the card through the unlock. OK? [yes]
9. Sections on the Chats tab: "Chats · Friends". OK? [yes]
10. Privacy & Security (passkeys, sessions, blocked, app lock, password) opens Chat's own page inside inflite.ai rather
    than being rebuilt as sheets: it keeps your keys out of the shared page and is quicker to build. OK? [yes]
11. Inside InFlite, Chats loses pull to refresh (it checks every 15 seconds instead) and swiping between Chats and
    Friends, like Weather. OK? [yes]
12. Go live straight after staging and checks, as stage 1? [yes; the switch is seconds]

---

## 13. Replies to the critiques

Every BLOCKING and IMPORTANT item, with where it is fixed. "Not taken" says why.

**Risk critique**
- **B1** sign-in rollback: fixed. Links unchanged; hop only while the framework serves `/chats/`; §8 level note;
  `todayauth` with `roof-off-chats` (S3-D8, §8, §10.2).
- **B2** two `service.js` records: fixed. Modules never import it (S3-C2 grep); one instance in frame state (S3-C3);
  `page.workers().length === 1` checks (§10.2).
- **B3** TOFU gate unprotected: fixed. Trust functions and the `pinsWait` slice in the parity list; `start` copies
  `engineStart`'s pins block; TOFU unit test (S3-D5, §10.1).
- **B4** lock unknown at start: fixed. `start({ locked })`, core locked by default, `service.js` reads `inflight-lock` first; boot test
  (S3-D14, §10.2 part 9).
- **B5** passkey add: fixed by the cheapest route. Privacy & Security (passkeys, sessions, re-auth, app lock) link to
  Chat's own page; no JWK, PRF or password crosses; `trust(id)` added; wildcards replaced by the frozen `META` table;
  RPC result key test (S3-D8, §5.4).
- **I1** `call()` to every script: fixed. Facade with seven frozen keys for the host; full service only via
  `fw.service()` (S3-D6, S3-C3).
- **I2** store keeps plaintext: fixed. `null` deletes; core nulls on leave/lock/drop; `clear` on lock/unmount (§3.2).
- **I3** sign-out leaves a core: fixed. `releaseService({ terminate })` on `signedOutNow`, user change, degrade;
  `signOut` awaits it before `forgetApps`; `gone` flag (§4.2, S3-D4).
- **I4** engine and core both alive: fixed. Bare `ifl-roof` = ask again; engine never before `mods`; Chats only turns on
  at page load, so no swap over a live engine (no `menu.js` change needed) (S3-D12).
- **I5** not-ready Send and `wrap`: fixed. Full navigation to `/chats/#share=` written down, hash tidied with
  `replaceState`; `send.js` toasts through `ui.toast`; `wrap` replacement listed (S3-D6, S3-D7).
- **I6** grep contradictions and push relay: fixed. Worker grep set and `idb.js` (S3-C2); `fw.on("push")` (S3-C5);
  greps scoped to `pigeon/roof/*`, `crypto.js` exempt.
- **I7** per-app checks: covered by S2 C3 (`loadModule` per app, `setRoof(on, app)`), which stage 3 builds on;
  `roofchatnav` part 2 asserts Weather stays mounted.
- **I8** rollback readability: fixed. Golden fixtures both ways; queued message sent by milestone 1's page (S3-D4,
  §10.2).
- **I9** two outbox writers: fixed. Web Locks around read-merge-write (S3-D4).
- **I10** stale reload loses text: fixed. S3-C7 and the draft flush on `hidden`.
- **I11** SW traps: fixed. Unregister before start (`opts.retired`); retire script routes first; root SW skips
  `?engine` and `/chats/in/` (§4.2, §6.2, §6.3).
- **I12** preload vs stamped imports: fixed. `connector.preload` (entry and connector only); `core.js` stamped (S3-D1,
  S3-C1).
- **I13** `/chats/in/` full app and relative paths: fixed. `/pigeon/in/` block (c); middleware serves `/_hub/in/<file>`
  (S3-D8).
- **I14** test gaps: 2–8 added (§10). 1 (WebKit Argon2): no longer needed, since Argon2 never runs in the framework page
  or its Worker (S3-D8); the passkey/unlock path is Chat's own page, already live at chat.inflite.ai.
- **I15** smaller points: `cache:` guard (S3-D4); object URLs page-only (S3-D3); device rule pinned to theme.js
  (S3-D13; a copy with a parity test rather than a shared file, because theme.js is a classic script we leave alone);
  degrade releases (S3-D12); bump rule (S3-D11).

**Build critique**
- **B1** stage 2's shapes: fixed. Stage 2's names throughout, stage 4's `stay`/`sections:false`/`replace`; the
  "whichever merges first" paragraphs dropped; B0 renames if the integrator froze other spellings (header).
- **B2** boundary shapes: fixed. §5.5 typedefs, fixtures and the stub core in B0; shape check in `roofchatservice`.
- **B3** sheets and CSS owners: fixed. `chsheets.css` split; every §2.2 sheet has a file and an opener (§2.2, §3.1).
- **B4** chat scroll: fixed. S3-D17 and S3-C7; `roofchatmount` checks.
- **B5** Send build: fixed. `startService({ ui })`; `wrap` replacements; Send states (S3-D6, S3-D7, S3-C3).
- **B6** B0 list: fixed (§11.1, handoff B0).
- **I1** budgets: fixed (§5.6); `rank.js` lazy in the core.
- **I2** `core.js` never cached: fixed (S3-D1 (b)).
- **I3** `crypto.js` Worker: fixed (S3-C2 exemption).
- **I4** Back and tab rules: fixed (§2.1 a–e, S3-C4).
- **I5** swap timing: fixed (S3-D6, synchronous at boot and in `applyHub`).
- **I6** indigo: fixed (S3-D16; George's Q1 keeps the choice).
- **I7** missing states: fixed (§2.1 table).
- **I8** two searches: fixed (§2.4, no list field; Q5).
- **I9** offline gets worse: fixed (`connector.lazy`, §5.3, §7).
- **I10** test owners: fixed (§10.2 "Must change (owners)").
- **I11** storage goldens: fixed (S3-D4).
- **I12** who hears the root worker: fixed through the frame relay (S3-C5) rather than a `serviceWorker` listener in
  `service.js`, so the S1 `serviceWorker` grep keeps holding for every module file.
- **I13** contradictions: fixed. `forgetHeard` named as the one `day.js` change; the `/pigeon/in/` block called new logic
  and tested (`roofchatserve`); Blobs cloned; the 1 s ticker is view code (`list.js`/`chat.js`); `wrap` corrected.
- **I14** framework budget: asked of stage 2's B0 (24 KB); stage 3 may go to 25 KB with a reason (§4.1).
- **I15** search providers: fixed (§2.4; `places()` checks Weather's only).
- **I16** lost behaviour: listed in `APP_NEWS` (S3-D15) and George's Q11; toasts text only (§3.3).
- **I17** root worker details: fixed (§6.3).
- **I18** outbox lock: fixed (S3-D4).
- **Batch split**: taken (six parallel batches; FW3+TD3 → HOST, CH → SV).
