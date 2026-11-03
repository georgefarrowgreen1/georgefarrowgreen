# Map: Chat, for a later stage of "one roof"

Source: MAIN `/home/user/up4/tf/georgefarrowgreen`, branch `claude/one-roof` (read only). Line numbers are from that checkout.
IFL references are `/home/user/up4/tf/inflite` on the same branch.
Chat is served at `chat.inflite.ai` (root; files under `/pigeon/`) and at the hub as `inflite.ai/chats/` (IFL `today/src/hub.js:19`
`PAGES["/chats/"] = { app: "CHAT", under: "/_hub/" }`, which proxies the page and `/api/pigeon/*`, with `/pigeon/` rewritten to `/chats/`).
At the hub it is also Today's **engine**: `/chats/?engine=1` in an invisible same-origin iframe, giving Today `window.IFLChat`.

Rule for every stage: **Chat stays end-to-end encrypted and its private key never leaves the phone.** The server
(`functions/api/pigeon/[[path]].js`) holds public keys, a password-locked "vault" copy and passkey-PRF-locked copies of the
private key, and ciphertext. Nothing a connector returns (cards, search entries, notifications) may contain a word of a message.

---

## 1. Files at a glance

| File | Lines / bytes | Kind | Exports | Globals / DOM assumptions | Depends on |
|---|---|---|---|---|---|
| `pigeon/app.js` | 12,539 / 1.0 MB | everything: state, crypto use, sync, views, shell, engine. **Lines 16-778 are the generated IFL block** (`const IFL`, from `.tools/inflite/menu.js`), so Chat's own code is ~11,750 lines | none (a module with side effects; `start().catch(bootFail)` at 12539). In engine mode it sets `window.IFLChat` (12248) | `#bird-path` SVG in the page (1126), `.view .compose .tabbar .layer .poplayer .toasts #msg .said` found by `mount()` (4661-4720) under `#screen`; `root().addEventListener("click", onClick)` (4709); `document` listeners for visibility/lock (10525), hash (12474), pageshow; `setInterval` 1 s ticker and 15 s sync (12485-12495); IndexedDB `inflight`/`kv`; ~30 `localStorage` `inflight-*` keys; `sessionStorage` `ifl-chat-wait` (12151); `parent.*` in engine mode; `navigator.credentials` (lock, passkeys); `navigator.serviceWorker` register `/pigeon/sw.js` scope `/pigeon/` (12538) | every file below |
| `pigeon/crypto.js` | 230 / 15 KB | **pure Web Crypto E2E** (header 1-21 explains the whole scheme) | `te, td, rand, b64, unb64, b64url, fromB64url, uuid` (23-38), `E2E` (80-230): `newIdentity, importPriv, fromPassword, fromSecret, lock, unlock, pair, keyProof, msgKey, seal, open, sealPhoto, openPhoto, sealGroup, openGroup, hash, safety, fingerprint, prfSalt, handbackPair, sealFor, unseal` | `crypto.subtle`, `Worker` (optional) | `argon2.js` (lazy `import`, 49), `argon2w.js` (Argon2id worker, 58) |
| `pigeon/argon2.js`, `argon2w.js` | 11+13 / 30 KB | hash-wasm Argon2id, and its worker | `argon2id` | worker | none |
| `pigeon/cards.js` | 643 / 40 KB | **pure**: the Send card (allow-list `normCard`), packing for links, payload build/pad, all words about a card | ~55 names: `normCard, normAsk, normPlan, normAns, normWhen, packCard, unpackCard, readShareHash, chatHash, payloadParts, buildPayload, padPayload, canForward, liveKey, liveItem, isLive, cardWords, landWords, whenLine, pigeonsFor, spendWords, sentToast, askWords, planWords, answerWords, whenWords, ...` | none ("no page, no network, no Buffer", header 7) | none; **also imported by the server** (`functions/_todaymkt.js`, `_share.js`, `_todaycards.js`) |
| `pigeon/cardview.js` | 290 / 26 KB | card HTML (Today's tcard look): returns escaped strings | `cardHtml, sheetCardHtml, askHtml, sideBySideHtml, inviteHtml, answerHtml, whenHtml, stripHtml` | none (strings); classes `cd-*` in `cards.css`; `data-act` names listed in header 6-9 | `cards.js` |
| `pigeon/rank.js` | 181 / 12 KB | **pure**: who a card suits, with reasons | `haversineKm, fmtMiles, seenFrom, rainAsk, rankFriends` | none | `cards.js` |
| `pigeon/digest.js` | 156 / 10 KB | **pure**: a friend's waiting messages as one line for Today (`waitingDigest(items, {stocks, now})`, contract in header 4-16) | `SAID_MAX, waitingDigest` | none, no clock | none |
| `pigeon/links.js` | 39 / 2 KB | pure link finding in message text | `linkParts, hrefOf, linksIn` | none | none |
| `pigeon/places.js`, `countries.js`, `placegrid.js`, `land.js` | 54+87+18+3 / 129 KB | pure geodata (places, country ranges, land mask) | `PLACES, nearestPlace, snapToMile, snapTo`; `COUNTRIES, RANGES, EDGES, SEAS`; `placeAt`; `LAND` | none | none |
| `pigeon/space.js` | 413 / 30 KB | pure Moon/Mars/orbit maths for space pigeons | ~45 (`spaceKinds, spaceFlight, lunarKm, moonPhase, orbitWhere, ...`) | none | none |
| `pigeon/moon.js` | 371 / 28 KB | canvas drawing of Moon picker/trip; `export * from "./space.js"` (6) | `spaceNow, sideLon, drawPick, pickAt, drawTrip, drawMoonPick` + space.js | canvas | `land.js`, `space.js` |
| `pigeon/qr.js` | 113 / 7 KB | QR encoder (sign-in QR, "not available" page) | `qr, qrSvg` | none | none |
| `pigeon/jsqr.js` | 10,108 / 257 KB | QR reader for Add Friend scan (lazy) | | | |
| `pigeon/shapes.js` | 3 / 48 KB | postmark shapes data | | | |
| `pigeon/theme.js` | 77 / 6 KB | plain script before paint: `data-theme` from `inflight-theme`, `html.engine` class (12-14), device check (`data-device="computer"`), meta theme-color | none | `localStorage`, `document.documentElement`, `window.parent` | none |
| `pigeon/index.html` | 71 / 4 KB | shell: `svg.defs #bird-path`, `main.notavail` (computer), `.page > .app#app > .sky + #screen`, `.rotate`; modulepreloads 35-46 | | | |
| `pigeon/styles.css` | 3,059 / 257 KB | Chat's own 1-2664 (shell 141, nav 184, lists 230, Messages 283, chat 318, tab bar 391, sheets 450, motion 542-765, flight log 918, chat redesign 1409-1596, composer 1596, sign-in motion 1828, passport 2269, Moon 2318, Privacy & Security 2402, Send sheet 2526, instant/pigeon 2564); **generated** sign-in CSS 2665-2783 and IFL menu CSS 2785-3039; hub/engine 3041-3059 (`html.engine` transparent, 3054) | | | |
| `pigeon/cards.css` | 74 / 6 KB | `cd-*` card looks | | | |
| `pigeon/sw.js` | 141 / 9 KB | push → notification + `{inflight:"sync"}` to open pages + delivered pulse (92-110); `pushsubscriptionchange` re-subscribe (114-128); `notificationclick` → `{inflight:"open", hash}` or open window (130-141); network-first shell cache (26-80). Reads the token from IndexedDB itself (`tokenHere`, 84-90) | | IDB `inflight` | |
| `pigeon/tracker.*`, `handover.*` | 287+47+88 / 10+42 | Chat Live (public map of pigeons) and the old-address handover iframe (`moveIn`, `app.js` 12321; `OLD_HOME = null` now, 12320, so dormant) | | | |
| `functions/api/pigeon/[[path]].js` | 1,783 | Chat API: auth (`salt, login, handback, resume, vault, passkey-*, reauth, sessions`), `pins` (GET/POST), `sync`, friends/block, `messages`, `read`, `way`, `recall`, photos, avatar, `push-key/push-sub`, `pulse`, admin; plus `GROUP_ROUTES, SHARE_ROUTES, TIME_ROUTES, REACT_ROUTES, ...` (imports 8-30) | `onRequest` | | `_pigeon.js` (1,118), `_groups.js` (694), `_notify.js`, `_share.js`, `_live.js`, `_pulse.js`, ... |
| `functions/_todaychat.js` | 183 | Today's Chat card + Waiting for You **metadata only**: `CHAT_COLUMNS` (22), `GROUP_COLUMNS` (26), `chatCard` (38), `waitingFor` (121), `wroteWhile` (166) | | | `_pigeon.js`, `_streaks.js`, `_todaycards.js` |
| `functions/_notify.js` (part) | 290-510 | Chat pushes: friend request (293), accepted (306), rerouted (329), following you (334), sent you a pigeon (340), group add/sent (353, 360), lost (501). Bodies are metadata ("Sent you a swift pigeon. It lands in 12m"), never words; `r.p.names` off gives "Chat" only | | | |
| IFL `today/public/app.js` | 1,830 (Chat parts) | hub contract comment 414-431; `HUB_APPS/TABS` 457-462 (`chats` is a top tab); `send` → engine or `/chats/#share=…&back=` (557); sign-in `/chats/#signin-start&then=` (565, 860, 1623); engine frame `f.src = "/chats/?engine=1"` (632) awaiting `ifl-chat-ready` (650); `chatSettings` → `/chats/#account` (1129) | | | |

Tests that cover Chat today: unit `engine.test.mjs` (runs the hub-rules block 786-821 on its own), `chatsonly.test.mjs`, `hubchat.test.mjs`,
`digest.test.mjs`, `cardview.test.mjs`, `cardsend.test.mjs`, `sharecards.test.mjs`, `sharerank.test.mjs`, `shareserver.test.mjs`, `chatlinks.test.mjs`,
`chattag.test.mjs`, `drafts.test.mjs`, `todaychat.test.mjs`, `pigeondb.test.mjs`, `instant.test.mjs`, `space.test.mjs`, `look.test.mjs`; e2e `.tools/tests/chats.mjs`,
`hubshare.mjs`, `sharecard.mjs`, `shareask.mjs`, `shareplan.mjs`, `instant.mjs`, `security.mjs`, `sec2.mjs`, `syncperf.mjs`, `storage.mjs`, `vanish.mjs`, `pigeonway.mjs`, `move.mjs`.

---

## 2. Encryption and key storage (what must not break)

- **Identity**: ECDH P-256 made on the phone (`E2E.newIdentity`). Per-pair AES-256-GCM via ECDH+HKDF (`E2E.pair`, `msgKey`, `seal/open`, crypto.js 124-160), with the
  message's `{id, from, to, type}` as associated data, so a ciphertext can't be replayed into another chat/kind (`ctxOf`/`keepPlain`, app.js 3516-3523).
- **Groups**: body sealed once with a random key (`sealGroup`), that key wrapped per member with the pair key; v2 wraps carry the body hash (`decryptGroup`, 3550-3565).
- **Photos / voice**: own random key, sealed like a message (`sealPhoto/openPhoto`, 163-178).
- **Password**: Argon2id (64 MiB, 3 passes) to 64 bytes: first half locks the private key ("vault", uploaded), second half is the login proof (crypto.js 7-13).
  **Passkeys**: WebAuthn PRF locks a second copy (`addPasskey`, app.js 3188; `prfSalt`, crypto.js 205). RP id `georgefarrowgreen.com` for both
  georgefarrowgreen.com and inflite.ai (app.js 929), via `/.well-known/webauthn` (`functions/_middleware.js:56`).
- **Sign-in** happens on `auth.<site>` and is handed back sealed to a one-tab key pair (`handbackPair, sealFor, unseal`; `signInBack`, app.js 2807; `#signin=` in `start`, 12379-12381).
- **On the phone** (`idb`, app.js 944-982, DB `inflight` v1, store `kv`):
  - `session` = `{ token, me, priv: <non-extractable CryptoKey>, pub }` (`useKeys`, 2700-2711). The key can be used by any script of the origin but not read.
  - `pins:<uid>` trusted key ids (+ `pinsup:`, `pinsunread:`), backed up to the server sealed to yourself (`serverPins`/`savePins`, 3363-3375). Key changes block sending (`trustedPub`, 3498).
  - `cache:<uid>` last sync + 12 chats, **still ciphertext** (3856-3869); `drafts:<uid>` sealed to yourself (3889); `outbox:<uid>` sealed letters awaiting signal (10642-10660).
  - `notify-asked`. Plaintext lives only in memory (`S.plain`, `S.msgs`).
  - `forget()` (2716-2738) wipes all of it, `localStorage` lock/badges/pushsub, and memory.
  - `sw.js` opens the same DB read-only for the token (84-90).
- **Origin matters**: IndexedDB is per origin. `chat.inflite.ai` and `inflite.ai` (`/chats/` at the hub) each have their own `inflight` DB, so the key must be unlocked once per origin.
  `engineState()` returns `"key"` when the site cookie says you're signed in but no key is here yet (12156, 12285).
- **App lock** (10488-10536): optional, per phone (`localStorage inflight-lock`), a user-verified passkey assertion checked locally (`lockCheck`, UV flag bit 0x04).
  On `visibilitychange` it sets `S.locked`, veils, closes sheets and `IFL.close(true)`. While locked nothing is drawn (`render`, 5070), and the engine reports `"locked"`.

---

## 3. Separation

### (a) UI-independent data and logic (reusable, after lifting off `S`/`api`/`idb`)

Already pure, as separate files: `crypto.js`, `cards.js`, `rank.js`, `digest.js`, `links.js`, `space.js`, `places.js`, `countries.js`, `placegrid.js`, `land.js`, `qr.js`.
Inside `app.js`, logic tangled with the global `S` and `render()` calls:

| Area | Lines | Notes |
|---|---|---|
| hub rules `hubPath, hashPath, engineRule, syncPath, tappedOn, makeIFLChat` | 786-821 | pure; unit-tested in isolation; reuse as is |
| constants, kinds, seasons, way/instant rules (`pigeonsOn, wayOf, nextOf`) | 831-907 | pure apart from `S.me` |
| state `S` | 910-927 | one 40-field global; the module's store |
| storage `idb`, server `api`, `xhrFetch` | 944-1028 | `api` also calls `renderOffline()`, and `forget(); go("welcome")` on 401 (1024): split UI out |
| formatting (`DOW`, durations, times, `MY_TZ`) | 1030-1124, 1813-1853 | pure |
| flight maths: weather on a route, country under a pigeon | 1854-1949 | pure-ish |
| keys and accounts: `useKeys`, `forget` | 2694-2738 | core; `forget` also touches the recorder, location watch, DOM blobs |
| `sync` | 3281-3362 | the heart: `GET sync` (or `sync?quiet=1` in the engine), skew, key checks, sig dedupe, then render |
| pins, `pairFor`, `trustedPub`, `keysOf`, `shapeOK`, `decrypt`, `decryptGroup` | 3363-3565 | core E2E use; **keep exactly** |
| groups model (`group, member, others, memberMs`) | 3536-3565 | |
| the pulse: typing, delivered/read, adaptive polling | 3641-3855 | timers; `POLL_MS` 904 |
| cache, drafts, view-once | 3856-4051 | |
| outbox and sending: `outboxLoad/Flush`, `send`, `sendLetter`, `sendGroupLetter`, `sendRun`, `sendRows`, `digestMsg` | 10642-11000, 11334-11380, 11424-11500, 11664-11780 | `send()` (10759) reads `$ta` and the composer: split |
| live card "Now", my cards for + | 11184-11235, 11899-12031 | `api("my-card?...")` |
| push (`pushEnable/Disable/refreshPush`) | 11006-11060 | moves to You (framework) |
| deep links `openLink` | 11097-11183 | `#open=`, `#requests`, `#account`, `#flightlog`, `#share=` |
| search inside chats `searchMessages` | 7034-7072 | on the phone only, over decrypted messages |
| engine | 12145-12290 | `engineState, engineCard, engineShare, engineSendOne, waitingItem, engineWaiting, engineSince, engineSignOut, engineReady, takeWait, engineStart` |

### (b) Views and rendering

| Area | Lines |
|---|---|
| icons `I`, bird path | 1125-1209 |
| map: canvas, wind map, rain radar, globe, smooth moves | 1234-2738 (~1,500 lines; Chat's biggest single view system) |
| welcome night sky | 3112-3187 |
| redraw machinery: `render` (5038), keyed redraw, animations | 4914-5135 |
| tabs: `vMessages` (5345), friends' news (5389), `vFriends` (5426), `vAccount` (5450), `vNotifySheet` (5506) | 5299-5573 |
| chat: `vChat` (6695), `vGroupChat` (6648), a message (5665-5804), share a flight (5805), in the air (5634), who has it (5652) | 5574-6064 |
| flight log, passport, postmarks, Coots, replies/reactions, mid-air moments, named pigeons | 6065-6732 |
| composer and tab bar, plan around the weather, composer row `renderCompose` (6886) | 6768-7033 |
| sheets: `sheetHtml` (7157), `renderSheet` (7309), ~50 sheet types (`send, addfriend, groupinfo, safety, passkeys, sessions, security, notifications, flightlog, passport, map, lookup, moonpick, way, gifs, fromapps, timetalk, ...`) | 7152-8281 |
| Moon pigeon, The Way, map card, In the Air strip, Look Up | 8282-9287 |
| menus, action sheets, banners, `toast` (9357), `announce` (9370) | 9288-9401 |
| GIF search, voice pigeons | 10385-10487, 10538-10641 |
| Send to a Friend sheet `openSendSheet` (11381), asking back, plans, Time to Talk | 11372-12144 |
| card HTML: `cardview.js`; looks: `cards.css`, `styles.css` 1-2664 | |

### (c) The app's own shell (replaced by the framework)

| Area | Lines |
|---|---|
| generated IFL block: menu, header, tab bar, updater, hub helpers (`IFL.hub`, `IFL.here`, `IFL.updates`, `IFL.wantsAllow`) | 16-778 |
| `HUB`, `ENGINE`, `hubSite`, `ASK_NOTIFY` | 822-829 |
| sign-in way in: `keepAdd`, `toAccount/toAuth`, `resumeCheck` (2761), `signInBack` (2807), sign-in motion | 2739-3111 |
| touch and navigation: tab swipes (4052), hold menus (4126), pull to refresh (4197), back swipe/edge (4266), zoom, Android back (4578), `mount` (4661), `go` (4808) | 4052-4913 |
| the click switch `onClick`/`onClick1`: ~270 `data-act` cases, one function | 9402-10384 |
| theme `applyTheme` | 10969 |
| `start` boot: hash parsing, moved note, `moveIn`, `notAvailable` (computer), ticker intervals | 12302-12499 |
| updates `IFL.updates({ app: "chat", build: APP_VERSION, busy, save })`, `IFL.built` | 12500-12507 |
| `APP_VERSION "1.68"`, `APP_NEWS` | 835-836 |
| SW registration, scope `/pigeon/` | 12538 |
| `index.html`, `theme.js`, `.notavail`/`.rotate` (phone-only policy) | |

---

## 4. What a Chat module needs

### Sections and deep links
The demo makes **Chats a top tab** (Today, Chats, Apps, You), as at the hub today (IFL app.js 462).

- `chats` → list (`vMessages`): In the Air strip (pigeons on), search, pinned/unread rows.
- `chats/:id` → a chat or group (`vChat`/`vGroupChat`). Today: `#open=<id>` (`openLink`, 11097; push `data.url`; `IFL.here("chat")` restore, 12448).
- `chats/friends` (`vFriends`), `chats/requests` (`#requests`), `chats/add/:handle` (`#add=`, 12394).
- Sheets as framework sheets: friend info, group info, safety number, flight log (`#flightlog`), passport, map card, Look Up, The Way, Moon picker, GIFs, + (from apps), Time to Talk.
- `#share=<words>&card=<packed>&back=<path>` (Send landing) → the framework's Send, not a Chat route.
- Keep `#signin=`, `#verify=`, `#invite=`/`#reset=` (forwarded to account) as framework sign-in routes.
- Back to a caller: `hashPath(..., "back"/"then")` rules (788-791) carry over.

### Send
Chat **is** the Send target for every app. Today: `IFL.hub.send(words, packed, {to})` → engine `share` (sheet over the page) or `sendTo` (one tap, only with real user
activation via `tappedOn`, 805-807, and only to a friend whose key is trusted and unchanged, 12185). The card is checked with `readShareHash`/`normCard` (12159-12164).
The framework's Send should be this flow owned by the Chat module: `rankFriends` (rank.js) for the "who should know" list, `sendRun` for sealing and sending, `sendRows`
for who can receive (groups included). Sealing must happen in the Chat module's context. The framework passes `{words, packedCard, to?}` and gets `{ok, say | why}` back.

### Search entries
- People and groups: names and handles from `S.friends`/`S.groups` (metadata, fine to give the framework's search).
- Messages: `searchMessages` (7034) works only on the phone over decrypted text. The framework's search must **call into the module** (a local provider), never index
  message text centrally or send it to a server. Results can be `{ chat id, first name, time, snippet }` computed in memory, not stored.

### Cards for Today
- Server card, metadata only: `functions/_todaychat.js` `chatCard` (38): landings, unread by friend, yours in the air, streak ending. Keep as Chat's connector "Cards".
- Waiting for You: the server gives `waitingFor` ids and counts (121); the **words** come from the phone through `engineWaiting` → `waitingItem` → `waitingDigest`
  (12198-12218), and `engineSince` for "wrote while you rode" (12219). In one roof this stops needing an iframe: the Chat module provides `waiting({ids, stocks})` and
  `since(id, t)` in-process, and must keep the rules: `quiet=1` reads (Today open isn't "seen in Chats"), nothing marked read, nothing kept.

### Notifications
- Push is sent by `_notify.js` (Chat bodies are metadata only) to the subscription held per sign-in (`push-sub`). The SW (`sw.js` 92-141) is scoped `/pigeon/` on chat.;
  at the hub "notifications are You's" (`ASK_NOTIFY` false, 829; `IFL.hub.moved` hands push off, 12462). The framework's single SW at `inflite.ai` needs:
  Chat's `tag` grouping, a `{inflight:"sync", tag}` message to the open page (→ module `sync()` + `pushTag`), a click → `chats/:id` (from `data.url` `#open=`), and the
  delivered pulse (`POST /api/pigeon/pulse` with the token, sw.js 99-101). That means the root SW must read Chat's token: either the module stores it where the SW can read it
  (today it reads IDB `inflight/kv/session`), or the pulse moves server-side.
- In-app: friend requests, landings (`playFresh`, `newPigeons`), "key changed" banners.

### Settings that move to You
From `vAccount` (5450-5504) and its sheets:
- Pigeons on/off, "New chats start as" (instant/by pigeon), Pigeon Death (`risky`) → You › Chat (or a Chat settings sheet opened from You, as `#account` + `hubyou` already do at the hub, 9422).
- Notifications (`notifyCell`, `vNotifySheet`) → You › Notifications (already the account's; `accountPage()` hides it in Chat).
- Privacy & Security: Encryption & Safety Numbers (`encCell`), Passkeys, Sessions, Blocked, **App Lock** → You › Privacy, but the lock and safety numbers must still run
  in the Chat module (they use `S.priv`, `S.passkeys`, `S.pins`).
- Location (`profile` sheet) → You › Profile (shared with Weather's "where").
- Appearance (`inflight-theme`), haptics, wind map, map card fold → framework appearance/preferences.
- Loft, Your Pigeons, Flight Log, Coots stay **in Chat** (game content, not settings).

### Actions (connector)
Server routes Chat would expose to the framework: `sync` (metadata), `friends`/`friends-respond` (accept a request from a notification), `read`, `my-card`,
`share-rank`, `pulse`. Anything that sends or reads a message must go through the module, because it seals and opens on the phone.

---

## 5. Reuse vs rewrite

| Piece | Verdict |
|---|---|
| `crypto.js`, `argon2*.js` | **reuse untouched** (audited; tests depend on it) |
| `cards.js`, `rank.js`, `digest.js`, `links.js`, `space.js`, geodata, `qr.js` | reuse as is (pure; server shares `cards.js`) |
| `cardview.js` + `cards.css` | reuse as the Send/letter card renderer. It already follows Today's tcard frame; remap `cd-*` to design tokens |
| `idb`, `api`, keys (`useKeys`, `forget`), pins, `decrypt*`, `sync`, pulse, outbox, drafts, cache, `send*`, engine functions | **lift into a `chat/core` layer** with no DOM: wrap `S` as the module's store, pass `onChange` instead of calling `render()`. Mostly mechanical, but `sync`, `send` and `forget` reach into DOM and timers and need care |
| hub rules block 786-821 | reuse; `makeIFLChat` becomes the module's public API (`state, share, sendTo, waiting, since, refresh, signOut`) |
| list, chat, message bubble, composer, sheets, menus, toasts, tab bar, nav, swipes, pull to refresh, hold menus | **rewrite with shared components** (framework list rows, sheet, action sheet, toast, header, tab bar). About 4,000 lines of Chat's own go |
| map/wind/radar/globe canvas (1234-2738), Look Up, Moon picker, passport, postmarks, flight log | keep as Chat-specific views (heavy, unique); lazy-load them (pigeons-off users never need them) |
| welcome sky, sign-in motion, moved/handover, `notAvailable`, `.rotate`, `theme.js` | drop: the framework owns sign-in, theme and device policy |
| `onClick1` switch (~270 cases) | rewrite as per-view handlers; the biggest manual job and the most likely place for regressions |
| `styles.css` 1-2664 | mostly replaced by the design system. Keep the chat bubble, map card, passport and Moon blocks. Drop generated blocks 2665-3039 |
| `sw.js` | merge into the framework SW (push branch by `note.app`, Chat's click/sync/pulse rules) |

---

## 6. Risks

1. **Same-origin exposure of the key and plaintext.** Today Chat at the hub already shares the `inflite.ai` origin with Today, Weather, Fitness, Markets and Mail pages
   (the engine iframe is same-origin, so it gives no real isolation). In one roof every module's code runs **in the same document** as Chat's decrypted messages and
   `S.priv`. The key is non-extractable but usable by any script there, and plaintext sits in `S.plain`. Options: (a) accept it, given one first-party codebase, strict CSP
   and no third-party script; (b) run `chat/core` (keys, IDB, decrypt, seal) in a **dedicated Worker** so other modules only see what the API returns. That needs DOM-free
   core, which (a)-section lifting gives anyway; (c) keep Chat on a separate origin and frame it, which loses one roof. Recommendation: (b) for the key/crypto core,
   with the module UI in the page. The spec must state which one.
2. **Per-origin key storage.** A phone that used `chat.inflite.ai` has its key there, not at `inflite.ai`. Users must unlock again (password or passkey) at the new
   origin, or Chat must keep `chat.inflite.ai` working during the move. Never copy the key across origins in the clear. The old `moveIn` iframe handover (12321-12352,
   now dormant) is the precedent: it moved the `CryptoKey` by structured clone through `postMessage`. Losing IDB (iOS evicts after ~7 days without a visit, unless installed)
   means re-unlocking from the vault, which is fine as long as the password or passkey is known.
3. **Key-change safety.** Sending only to unchanged trusted keys (`trustedPub`, `keysOf`, `pinsCatchUp`, `sendTo` falling back to the sheet) must survive the rewrite.
   A framework Send that "just sends" could bypass it. Keep it inside `sendRun` and test it (`engine.test.mjs`, `hubshare.mjs`).
4. **Size and coupling.** 11,750 lines in one module scope with ~600 functions sharing `S` and `$view`/`$ta`/`$layer`. Lifting core logic risks subtle behaviour
   changes (signature-based redraw skipping in `sync`, `meTurn/meOut` races 1000-1015, `S.token` re-checks after every await). Do it file by file, with the
   existing e2e (`chats.mjs`, `syncperf.mjs`, `instant.mjs`) as the oracle.
5. **Notifications through one SW.** Chat's SW is scoped `/pigeon/` on its own host. A root SW must not drop Chat's delivered pulse (ticks) or show a generic
   body. Two SWs on one origin with overlapping scopes conflict, so plan the cut-over.
6. **Engine to in-process.** Today relies on `ifl-chat-ready`, `IFL.hub.sent/closed`, the `WAIT_KEY` handover (12151, 12255) and `quiet=1`. Replacing the iframe changes
   timing, and the user-activation check (`tappedOn` with getters captured early, 12245-12246) must stay, to keep one-tap sends tap-only.
7. **Phone-only and the lock.** Chat refuses computers (`theme.js` device check, `notAvailable`). The framework runs everywhere, so the module needs a "not on this device"
   state. The app lock must also cover the framework's own surfaces showing Chat data (Today's Waiting for You, search results), not only the Chats tab.
8. **Versions.** Chat keeps its own `APP_VERSION` (CLAUDE.md). The module must still feed `IFL.updates` `busy()` (writing, recording, sending, in a sheet; 12505)
   so an update never reloads mid-message.
9. **Minified copies.** `min/pigeon/app.js` must be regenerated (`node .tools/minify.mjs`) with every change. `min.test.mjs` fails otherwise.
