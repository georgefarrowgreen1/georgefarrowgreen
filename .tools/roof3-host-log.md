# One roof, stage 3 · HOST (framework and Today): log

Batch HOST of stage 3 (Chats under the roof), built on `r3/host` in both repos from `claude/one-roof-24`, with B0's
`r3/b0` merged as it landed (last: MAIN `101d484`, IFL `f44193f`) and `claude/one-roof-24` merged again at the end
(MAIN `7200d60`, IFL `be3b9b3`). Brief: `s3/handoff.md` "HOST"; spec `s3/spec.md` §2.1, §2.4, §4, §5.1–§5.3,
S3-D6/D8/D12/D14/D16/D17, S3-C1–C7; names as `s24-contracts.md` has them (`apps`, `ROOF_CHATS`, `link`, `stay`).

## IFL is not pushed: fetch it from the bundle

This session could push only to the georgefarrowgreen repo: pushing to `georgefarrowgreen1/inflite` was refused (403),
and attaching that repository to the session was refused too. So IFL's `r3/host` (head `fd0510e`) is handed over as a
git bundle in this branch, history and merges intact:

```sh
git -C inflite fetch ../georgefarrowgreen/.tools/roof3-host-ifl.bundle r3/host:r3/host   # then push it as usual
```

The bundle holds `claude/one-roof-24`..`r3/host` (it needs `be3b9b3` present). Delete
`.tools/roof3-host-ifl.bundle` from MAIN once IFL's `r3/host` is pushed.

## What I built

**IFL `today/public/roof/frame.js`**
- An app with REGISTRY `tab` (Chats) is a tab screen at its root: header with your photo, no Back, no crumb, its
  switcher kept; `F.tabs.set(R.tab)`, so its own tab is current in every route of it. A `stay` route of it (a chat) gets
  Back "Back to Chats" when cold (else "Back to <previous>"), and a cold `F.nav.back()` goes to `R.path` in place; at
  the root Back does nothing (rules a, e).
- Tab cross-fade whenever both routes are tab screens, the Chats root included (rule b).
- No window scroll put back for a tab app's `stay` route (a chat scrolls its own, S3-C7). **Mail's thread keeps s24
  C7's scroll** (s24 overrides stage 3's wider wording; a case pins it).
- Services: B0's stub filled in. `F.service(app)` waits for `opts.retired`, one promise per app; a service let go of
  before its turn is never made; once made, it's heard from only while it's still the app's current one.
  `F.releaseService` returns a promise (Today's signOut awaits it). `unmount(app)` ends the app's service, so the
  switch turning Chats off (`setRoof`, after the module's own flush) and sign-out (`destroy`) terminate the core.
  `F.service` refuses after `destroy`.
- `opts.serviceState(app, state)`: the state the service started in at once (its first patch came before `startService`
  resolved), then each `state` patch.
- Chats' search (`connectors.chatsProvider`) registered by the frame while the service is `ready` or `offline`, gone on
  any other state, on release and on sign-out.
- Push relay (S3-C5): the root worker's `{ inflight: "sync", tag }` emitted as `{ app: "chats", tag }` to the Chats fw
  only (`fw.on("push")` maps to `push:<app>`).
- `fw.tabs.away(on)`: true only while that app's screen shows; the frame puts the bar back as the screen changes.
  `fw.tabs.badge(n)` goes to the app's own tab (`REGISTRY[app].tab`; none for other apps).

**IFL `tabs.js`, `roof.css`**: Chats is a tab screen while `F.session.apps.chats` (in-page, a tab move; on its list,
to the top; from Friends, the list; Apps from Chats is a tab move, not Apps' back). `.chats` on the bar while Chats is
in the page = InFlite's indigo (`#5a4fe0` / dark `#9a90ff`), scoped to the bar (S3-D16); **with Chats off the bar is
menu.css's blue as before**. `badge(tab, n)`: `.ifl-tab-badge`, a number only, 99+, none at 0, kept as the bar redraws.
`away(on)`: `.away` and `inert`. The toast sits above a composer while the bar is away.

**IFL `modules.js`**: `IFL.built(R.id || app, …)` (Chats → "chat"); `preload` reads `connector.preload` before
`files`. `keepOffline` left as s24 §8 has it (files after mount; files ∪ lazy only standalone).

**IFL `connectors.js`**: `chatsProvider(F, svc)`: People (order 15; 5 on the Chats screen) from the friends and groups
topics through `svc.on("*")` (the only subscription the service replays), names only, never the blocked; Messages
(16; 6) from `svc.call("search", q)`, q trimmed and cut to 100, nothing asked for a blank. Each entry opens
`/chats/#open=<id>` (ids checked `[\w-]{1,40}`). `places()` (spec §4.1) no longer exists after j0: Places is the
per-app `connectorProvider`, untouched while the chats provider is the frame's own.

**IFL `today/public/app.js`**
- Chats decided once as the page boots (`chatsSay` in `hubSays`, before the frame is made): on → `IFL.hub.chat =
  () => F.service("chats")` (null where there's no frame or it's refused); off later (switch or degrade, in `applyHub`
  before `setRoof`) → the engine's own `chat` back; on later → stays off until the next load (the frame is told off).
- A bare `ifl-roof` with no `ifl-roof-apps` (a page's from before stages 2–4) is asked again at `/`.
- `start()`'s first line: `/chats/` or `/chats/index.html` with `#signin…`, `#verify=`, `#invite=`, `#reset=` →
  `location.replace("/chats/in/" + hash)`. Sign In's hrefs unchanged.
- `retireOld()` keeps a promise of the unregistering; `opts.retired` = it, capped at 3 s.
- `signOut()`: the facade's signOut (the core's), then `F.releaseService("chats", { terminate })` (2 s at most), then
  `forgetApps({ chat: chatsHere || !chatOut })` (Chat's store cleared here too with Chats in the page; sealed drafts
  and outbox kept). Another account signing in: released. `signedOutNow` → `unframe()` → `destroy` ends it.
- `serviceState`: Chats `locked` → `#today .dw-words, .dw-chips, .dt-said` emptied and hidden, `day.forgetHeard()`
  (the spec's `.dw-said` is `.dw-words` in day.js; chips cleared too, as they're drawn from the message's topics).
- The root worker's push sync isn't sent to the facade too with Chats here (the frame relays it to the service).
- `chatSettings` → `F.nav.go("/chats/#settings")` with Chats here. `USED.chats = "ifl-build:chat"` for the idle preload.
- `day.js`: `forgetHeard()` only. `you.js`: Chat row "Pigeons, privacy and your loft" with Chats here; Connected Apps'
  words cached per Weather and Chats roof.

**MAIN tests** (`roofui`, `roofpage`, `roofshell`, `todayshell`): see below. `mocks/todaystub.mjs` is unchanged: it
stands in for the account only, and `/api/hub` (where `apps.chats` lives) is answered by each shell's browser route.

## Proof (on the final merged commits: MAIN `8c75d60`+, IFL `fd0510e`)

- Unit, `node --test .tools/tests/unit/*.test.mjs`: **1383 pass, 3 fail, 7 skipped**. The 3, none in a HOST file:
  `min` (expected until I); `todayfiles` "Today’s copies … byte for byte" (also red on a clean `claude/one-roof-24`
  pair); `todaysw` case 13 (B0's new `roofcontract` NET table for Chats vs SV's `sw.js`, which has no Chats NET yet:
  SV's). Before the last `claude/one-roof-24` merge: 1328 pass, `min` only.
- HOST's own unit cases: `roofui` 7 of its 16 (frame run with Chats on: tab-screen header and Back, cross-fade kinds, stay
  scroll, Mail's thread scroll, services after `opts.retired`/one per app/facade vs full/state/search/terminate on
  release, switch and sign-out/none after sign-out, a service let go of while starting, push relay, away and badge;
  `tabs.js` itself on fakedom; `chatsProvider` run), `roofpage` 3 (the hop run on addresses, the swap run through
  `chatsSay`, release order in signOut, retired, lock, settings). Four frame mutations each turned a case red.
- `node --check` every changed `.js`/`.mjs`: clean. IFL `npx wrangler deploy --dry-run`: ok.
- e2e `./run.sh roofshell todayshell` on the final merged state: **roofshell FAILS 0 (164 PASS), todayshell FAILS 0
  (208 PASS)**. Chats-on parts: roofshell "Chats in the page" (the tab
  in the same document, a tab screen, Chats current, indigo the same on Today and Chats, no engine, one Worker; the
  `#signin=` hop to `/chats/in/`), todayshell "Chats in the page" (Waiting for You's words from the service, no
  iframe, one Worker, words gone when the core locks; Sign Out: core signed out before Chat's store cleared). The core
  there is a stand-in Worker inside each test (it answers what the facade asks, can lock itself and marks its signOut);
  service.js and the module are MAIN's `pigeon/roof/` files as the hub serves them.
- Budget, `roof/*.js` gzipped, comments stripped (roofui's cap 24 KB = 24,576 B): `claude/one-roof-24` 22,495 → B0
  23,213 (+718) → HOST **24,248** (+1,035). Under the cap with 328 B left, so no raise to 25 KB. Note: B0 + HOST
  (+1,753) is over the 1,300 B s24 §13 planned for stage 3; it fits because stage 2's FW used 145 of its 850.

## Open issues / needsFromOthers

- **Integrator**: fetch IFL `r3/host` from the bundle (above) and push it; delete the bundle from MAIN.
- **search.js owner (j0/integrator)**: spec §2.4's Apps provider entries "Chat Settings" (`/chats/#settings`) and
  "Flight Log" (`/chats/#flightlog`) need `search.js` (not HOST's). "Chats · Friends" comes from REGISTRY already.
- **CORE / UI-A**: a Messages result opens its chat only (`/chats/#open=<chatId>`); opening *at the message* needs a
  frozen way to hand the result's `token` to the module in memory (no URL may carry it): a B0/integrator decision.
- **CORE**: the service's `on(topic)` replays only for `"*"`; the frame relies on `svc.state` for the first state and
  `chatsProvider` on `"*"`. Keep both as B0 froze them.
- **SV**: `todaysw` case 13 (Chats' NET in `sw.js`); `todayfiles` is red on the integration branch already.
- **B0/UI-A**: `fw.tabs.away(true)` is ignored unless the Chats screen shows; the module should call it in `show()` of a
  chat and `away(false)` in `hide()`/the list's show (the frame also puts it back on any screen change).
- Switch off mid-session while a chat is busy: `IFL.hub.chat` goes back to the engine at once, while the core lives
  until the bounce; a Today redraw in that window could make the engine beside the core briefly (S3-D12's "never
  together" is about turning *on*). Small; left as is.
- The toast-over-composer rule uses a fixed lift (`max(--tabs-h, 120px) + 16px`), as the composer's height isn't known
  to the frame; UI-A may want a better hook.
- Deep review (R3) of the `frame.js`, `tabs.js`, `app.js` diffs: self-reviewed adversarially (findings fixed: Mail's
  thread scroll, a service released while starting, no service after destroy, B0's failure path dropping a newer
  service, the off-screen bar focusable, the first state missed). The integrator's reviewer still to sign off.
