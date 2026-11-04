# One roof, stage 3 — batch UI-B (Sheets, Send, settings): log

Branch `r3/ui-b` (MAIN only: UI-B owns no IFL file; the IFL branch `r3/ui-b` exists locally but pushing it got a 403,
and it has no commits beyond B0's merge). B0 (`r3/b0`) merged up to `101d484` (MAIN) / `f44193f` (IFL).

## What I built (MAIN `pigeon/roof/`)

- **`send.js`**: `openSend(ui, svc, { card, words, to, back? })`. The card is checked as `engineCard` (a packed string
  or a card object, through `readShareHash`/`normCard`); rows from `share`, reasons from `rank`; picks (12 at most);
  Now / By Pigeon; "Ask How’s Yours?"; sealed only by `sendRun`; progress from `send` patches; on sent
  `ui.toast(stillHere(say))` and `{ ok: true, say }`. Not-ready states by the core's state: `signin`, `key`, `ended`
  (words + a link to `/chats/in/#signin-start&then=%2Fchats%2F`, card not kept), `device`, `locked` (the sheet draws
  once the state turns ready), `offline` (the sheet + "It’ll go when you’re back online"). Closed unsent →
  `{ ok: false, why: "no" }` (B0's word). No card that passes → `{ ok: false, why: "card" }`, no sheet. Optional
  `back` (hubPath rule) is gone back to with `fw.nav.go(back, { replace: true })`. Also exports `engineCard`,
  `shareOf(hash)`, `stillHere`, `hubPath`, `NOT_READY`.
- **`sheets.js`**: friend info, group info, add people, group name, safety number (digits in fives, QR of the digits,
  trust/verify through the core), who has it, photo view (Blob from `photo`, URL from `media.js`), schedule, a time to
  talk, add from the apps, hold menus as action sheets (reactions, copy, send a card on, map, recall, contact/group
  acts). Optional extra arguments: `openSchedule(ctx, id, { at, pick })`, `openFromApps(ctx, id, { pick })`,
  `openHold(ctx, { kind, chatId, msgId, on(act, id) } | { items })`.
- **`flight.js`**: flight log, passport, map (world coastline canvas + the flight's facts), skies, Look Up, the way,
  Moon/Mars pick (moon.js's `drawPick`/`pickAt`), your pigeons, a pigeon, naming one, a friend's loft (counted, never
  named), Coots and the shop, friends' news.
- **`media.js`**: `openGifs`, `recordVoice` (MediaRecorder in the page), `pickPhoto` (shrunk in the page), `blobUrl`
  / `revokeAll` (the only object URLs).
- **`scan.js`**: `openScan(ctx, { id, digits }?)`: camera + BarcodeDetector or `../jsqr.js`; a match is `verify`; a
  changed key opens the Safety Number instead.
- **`settings.js`**: `openChatSettings(ctx, page?)` with pages `location`, `credits`: Pigeons, New Chats Start As,
  Your Loft, Pigeon Death, Who Sees What (`shareNews`, `approxLocation`, `shareTracker`), Location, Privacy & Security
  = `<a href="/chats/in/#account">`, Map & Weather Data. Saves are `meta("me", { method: "PATCH", …key })`.
  `../places.js` (NET) only through `fw.lazy` on the Location page, so the sheet opens offline.
- **`chsheets.css`**: under `.ifl-sheet[data-app=chats]`, tokens only.
- Cross-file hops (e.g. Friend Info → Loft, Safety → Scan) load the sibling through `fw.lazy` directly, never
  through `ctx.open` (UI-A's `open` uses its own short, ctx-bound names).

## Tests

- `node --test .tools/tests/unit/roofchatsheets.test.mjs`: **6 pass, 0 fail** (rules grep over the six files; every
  opener (30 cases) on the stand-in DOM with IFL's real ui.js/sheet.js: data-sheet, data-app, handle, escaping, no
  style/handler, only RPC methods and META names; Chat Settings link and save; Send's card check, ready send, toast,
  back, closed; the six not-ready cases; safety/scan helpers). A mutation (a name put in as markup) makes it fail.
- Full unit suite: **1309 tests, 1301 pass, 2 fail, 6 skipped**. Failing: `min.test` (expected until I) and
  `roofcontract` "chats: connector … lazy" wanting `/chats/qr.js` (sheets.js's safety QR) — UI-A's `r3/ui-a`
  connector already lists it, so it goes green when UI-A merges.
- E2e `./run.sh roofchatsheetmount`: **FAILS 0** (214 PASS lines): every UI-B sheet opens and closes by hook at 390,
  light and dark, axe clean; Chat Settings' Privacy link; safety digits; Send ready (rows, key-changed row disabled,
  pick, sendgo, toast "Sent. You’re still here"); signin, key, ended, device, locked (then unlocked), offline; no CSP
  violation, no page error, no request carrying the typed words.
- `node --check` clean on every file I changed.

## Lazy sizes (gzip -9 of minify.mjs's esbuild output, measured in scratch)

send.js 3,520 B · sheets.js 8,373 B · settings.js 3,850 B → **sheets + settings + send 15,743 B**; flight.js 8,459 B
(own, network-only); media.js 3,550 B; scan.js 1,768 B; chsheets.css 1,977 B; reused qr.js 2,153 B.

## What other batches must know (needsFromOthers)

1. **B0 (kit)**: `roofkit/serve.mjs` does `.replace('__KIT_STATE__', st)`, which replaces the placeholder in
   `chatcore-stub.js`'s header comment, not the `const START`: the stub always starts `ready`. Use `replaceAll` (or
   drop the word from the comment). `roofchatsheetmount` routes core.js itself meanwhile.
2. **B0 (roofkit part 12)**: its `send.js` case expects the stub (`card: null` opens a sheet, closes `why: "no"`).
   With UI-B's `send.js`, `card: null` → `{ ok: false, why: "card" }` and no sheet (S3-D7); use a valid card.
3. **UI-A**: keep `/chats/qr.js` in `connector.lazy` (already on `r3/ui-a`). `chats.js` may pass `ctx.chat` (the open
   chat's id) so `openView`/`openWhoHas`/`openMap`/`openHold` find a message quickly (they also look through `rows`).
   The composer gets answers via the optional callbacks above (schedule `pick(at)`, from-apps `pick(card)`, hold
   `on("reply" | "retry" | "delete", id)`).
4. **CORE / B0 (META)**: naming a pigeon calls `meta("birds", { method: "POST", name })` and
   `meta("bird-name", { method: "POST", id, name })` (Chat's own endpoints); neither is in META yet, so it's refused.
   `Me` has no `birds`/`hall`: `openBirds`/`openBird` read `me.birds`/`me.hall` if the core adds them. The way of a
   chat (`instant`/`pigeon`) isn't on `Row`/`Friend`; `openWay` reads `row.way`/`friend.way` if present.
   `meta()` args carry the HTTP method as `method` (e.g. `{ method: "PATCH", risky: true }`): CORE please confirm.
5. **CORE**: a time to talk can't carry the structured `when` invite through `sendText` (its opts are way, kind,
   replyTo, at); `openTimeTalk` sends the invite's words as a message and doesn't record `time-offer`. A sendText
   option for `when` (and the time-offer record in the core) is needed for parity.
6. **CORE**: `Msg.flight` carries no route points, so `openMap` draws the world and the flight's facts, not its path.
7. B0's `ONE.Card` fixture doesn't pass `normCard` (no `snap`); tests use their own valid card.

## Open issues

- The map, Look Up and the passport are simplified ports (no route drawing, no passport book pages); flight log's
  postmarks and looks aren't drawn.
- `send.js` offers Now / By Pigeon only (Before the Rain, With Their Morning and Make It a Plan need data the
  boundary doesn't carry: rain at friends, time zones, `together`).
