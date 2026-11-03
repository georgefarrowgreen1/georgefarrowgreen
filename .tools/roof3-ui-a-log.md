# One roof, stage 3 · UI-A (entry, list, Friends, chat, lock): log

Branch `r3/ui-a` in both repos (MAIN carries the work; IFL carries only B0's merged commits, no UI-A edits). Built on
`claude/one-roof-24` with B0's `r3/b0` merged (MAIN up to `101d484`, IFL up to `f44193f`).

## What was built (MAIN `pigeon/roof/`, the files UI-A owns)
- `chats.js`: the entry. `mount(root, fw)` gets the service only through `fw.service()` and feeds every patch into the
  store through `svc.on("*")`. It builds, inside `.m-chats`:
  - the state panel (`[data-state]`: signin, key, ended, offline, device with its QR from `../qr.js`, error with Try
    Again / Open Chats on Its Own), plus placeholder rows until the core first answers;
  - the lock screen, the two sections and the chat host.
  - Header: tab-screen style at the root (title "Chats", line "2 unread · 1 in the air", acts New Chat and Chat
    Settings, none unless ready); a chat sets its own header.
  - `show(route)` handles `#open`, `#settings`, `#account`, `#flightlog`, `#requests`, `#add` and `#share` (read once
    from `route.hash`; then `back`). An unknown chat id goes to the list with the toast "That chat isn’t on this phone".
  - While shown and visible: `start({ visible, screen: true })`, then `sync` every 15 s. When hidden: no timers.
  - When locked, or no longer ready: the open chat is left, `chat:*` and `typing:*` are cleared and row lines blanked.
    The same on unmount.
  - `deviceOf()` is theme.js's rule, line for line. Lazy openers go only through `fw.lazy((q) => import("./x.js" + q))`.
- `store.js`: `null` deletes a topic, `clear(prefix)`, one call per topic per microtask, and `"*"` gets
  `{ topic, data }` (B0's shape).
- `list.js`: the Chats section: key warning, requests banner, In the Air, rows pinned then newest with a keyed patch,
  and the first-run card. It asks `rows(0, 30)` for the lines and runs a 1 s ticker while shown and visible. Also
  `openNewChat` and `openNewGroup` (creates the group through `meta("groups")`), and the helpers the views share.
- `friends.js`: the Friends section (requests, Friends’ News, friends by name, groups, blocked count, your handle).
  Also `openRequests` (Accept / Decline through `meta("friends-respond")`) and `openAddFriend(ctx, handle)` (through
  `meta("friends")`).
- `chat.js`, the chat view (S3-D17):
  - One scroller sized from `visualViewport` (its listeners are removed on hide), with `fw.fill(true)` and
    `fw.tabs.away(true)`.
  - Sticks to the bottom; anchors when `older()` adds messages above; remembers per chat, in module memory, the
    message at its top.
  - The composer: the draft goes to the core 1 s after typing, and at once on `hidden` and `flush()`. Send calls
    `sendText`.
  - Marks the chat read while it is visible.
  - Bubbles for every `Msg` kind: cards through `cardview.js`, falling back to the card's sentence; links through
    `links.js` as text nodes.
  - Header: Back "Back to Chats", no switcher, Info.
  - Leaving takes the words out of the DOM and the store.
- `lock.js`: the lock screen and its passkey check (UV flag, Chat's RP id). `watch()` veils the screen while hidden
  and locks the core again after the lock's time.
- `chats.css`: under `.m-chats`, tokens only; a chat is fixed from `--hd-h` to the visual viewport.
- `connector.js`: B0's, minus `STUB`, plus `/chats/qr.js` in `lazy` (the device state's code).

## Tests (on the final commit)
- `node --test .tools/tests/unit/*.test.mjs`: **1304 pass, 1 fail, 6 skipped**. The one fail is `min.test`, which
  names only `pigeon/roof/*` files that have no minified copy yet (expected until I).
- `roofchatviews.test.mjs` (new): **8 pass, 0 fail**. It covers:
  - store topics → view patches, and a row whose data hasn't changed staying the same element;
  - `null` deleting a topic, and `clear` on lock and unmount;
  - data never becoming markup; no style attribute and no inline handler in anything drawn;
  - the §2.1 states and the device rule; an unknown chat id; the sheets by name.
- `roofcontract` and `roofrouter`: pass.
- `node --check`: clean on every `pigeon/roof/*.js` and both tests.
- e2e: `./run.sh roofchatmount` → **FAILS 0** (kit page, stub core). It covers:
  - the list, Friends, and the New Chat / Add Friend / Requests sheets opening and closing by hook;
  - a chat: Back, `ifl-fill`, starting at the bottom, the per-chat anchor coming back to the same message, the last
    message in sight with the keyboard up, sending;
  - all five states plus device; axe on the list and on a chat; no CSP error and no page error;
  - 320 (dark) / 390 / 1280 wide, with nothing wider than the window.

## Budgets (§5.6; `fixtures/budget.mjs staticGz("chats")`)
- Page static JS: **32.5 KB** gzipped (budget 110), counting chats, connector, store, list, friends, chat, lock,
  `../cards.js`, `../cardview.js` and `../links.js`.
- CSS: **3.9 KB** gzipped in total (budget 28). `chats.css` alone is 2,327 B.

## Open issues and what other batches must know
- **B0/HOST, a bug in `roofkit/serve.mjs`:** it writes the state into the stub core with `.replace('__KIT_STATE__', st)`.
  The first match is the stub's own header comment, so `?state=` never takes effect and the stub always starts
  `ready`. The fix is `replaceAll`. Until then, `roofchatmount` serves the stub itself through its own context route.
- **HOST:** `fw.tabs.badge(n)` and `fw.tabs.away(on)` are called by the module but are still B0's inert stubs in
  `tabs.js`.
  - Until `away` is drawn, the tab bar lies over the composer. `roofchatmount` checks `TAB_BADGE` and `TABS_AWAY` only
    once `tabs.js` has them (it reads `tabs.js`), says NOTE until then, and dispatches the Send tap directly.
  - Once `away` lands, the Send tap becomes a real click.
- **Locked state:** the service starts the core unlocked unless `inflight-lock` says `{ on: true }` for this user,
  which is Chat's own rule. The `locked` part of `roofchatmount` therefore sets that key, besides `?state=locked`.
- **UI-B:** the module opens your sheets with:
  - sheets.js: `ctx.open.friendInfo(id)`, `groupInfo(id)`, `safety(id)`, `view(msgId)` (the photo and voice buttons),
    `hold({ chatId, msgId })`;
  - flight.js: `map(msgId)`, `flightLog()`, `news()`;
  - settings.js: `settings(page | "account" | null)`;
  - media.js: `photo(id)` → `pickPhoto(ctx, id)`, `voice(id)` → `recordVoice(ctx, id)`, `gifs(id)`;
  - send.js: `send({ card, words, to })` → `openSend(fw, ctx.svc, …)`. `ctx.svc` is `{ call, on }`; its calls wait
    for the service.
- **Fixed links:** `fw.session` carries no `links`, so "Open Chats on Its Own" falls back to
  `https://chat.inflite.ai/`.
- **Not done, deliberately (R1):**
  - photos and avatars: a Row's `avatar` is a key that needs a `meta("avatar")` Blob and an object URL, so the views
    draw initials, and the photo and voice bubbles are buttons that open UI-B's `openView`;
  - a long press on a bubble that has a link or a button inside isn't keyboard-reachable on its own: the bubble stops
    being a button so it isn't a nested interactive, and a tap beside the inner controls still opens the hold menu.
- No versions bumped; neither `minify.mjs` nor `wxshell.mjs` run; `suite.txt` not edited.
