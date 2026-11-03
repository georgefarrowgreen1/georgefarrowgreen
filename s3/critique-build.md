# Stage 3 (Chats under the roof): buildability and UX critique

Read against `s3/spec.md`, stage 1's `spec.md`, `addendum.md` (R1–R3), `s2/spec.md` (built first, so its contract
shapes win), and the code at MAIN `0eb3506` / IFL `dee9d49`. Verdict: the architecture is right (Worker core, service
in place of the engine, port without refactoring standalone, sign-in kept on Chat's own page), and most of the server
work is ready to build. **It can't start as a parallel build yet.** Six points block it: four are contracts the batches
would each have to guess, one is a clash with stage 2's shapes, and one is a missing UX decision (how a chat scrolls)
that the frame and the chat view would each settle differently. Fixes below. With them, B0 is about half a day and six
batches can then run at once.

Since George asked how to make the whole process faster, the last section lists what saves the most time.

---

## Measured sizes (gzip -9 of what is served: `min/pigeon/*`)

| What | Spec budget | Measured / estimated | Note |
|---|---|---|---|
| `app.js` (whole engine page) | – | 226.5 KB (min), 319.3 KB (source) | spec's "226 KB" is the minified figure: right |
| `styles.css` | – | 44.2 KB (min) | spec's "44 KB": right |
| Reused by the core: crypto 2.8 + cards 9.2 + digest 2.6 + rank 3.1 + links 0.6 | (in 30) | **18.3 KB** | matches the spec |
| **Core's own code** (app.js ranges the spec ports: idb/api, keys, sync, pins/decrypt, pulse, cache/drafts, outbox/send, search, engine, live card, constants/formatting) | **≤ 12 KB** | **≈ 35 KB** for the full list; ≈ 17.6 KB for the bare minimum (idb, keys, sync…cache, outbox, sendRun, engine) | estimated from the source ranges with comments stripped, × 0.91 (stripped → min ratio for the whole of app.js: 248 → 226 KB) |
| Core graph (first start) | ≤ 30 KB | **≈ 36–53 KB** | |
| Today's idle start (`service.js` + core graph) | ≤ 34 KB | **≈ 38–55 KB** | still about 5× smaller than the 270 KB engine: the gain holds, the number doesn't |
| Page static JS (list, friends, chat, composer, hold menus, click handling, deep links, icons + cards/cardview/links + chats.js/store/service) | ≤ 110 KB | **≈ 85–92 KB** | fits |
| `chats.css` (styles.css 283–1596 + 2269–2564) + `../cards.css` | ≤ 28 KB | **≈ 23.4 + 1.6 = 25 KB** | fits, little to spare |
| Lazy: flight views + map (1234–2738, 8282–9287) | – | ≈ 44 KB own + geodata (placegrid 25.3, shapes 19.2, land 12.7, space 8.0, moon 7.1) | fine as lazy |
| Lazy: every sheet (7152–8281) | – | ≈ 29 KB | split between `sheets.js` / `settings.js` / `send.js` |
| `roof/*.js` framework | 20 KB → 24 KB | 20 453 / 20 480 B today | stage 2 will overflow first (see I14) |

---

## BLOCKING

### B1. Contract shapes clash with stage 2's, which merges first
Stage 3 says "whichever stage merges first writes the general form", but the two specs name different forms, and R3
says stage 2 is built first:

| Thing | Stage 2 (`s2/spec.md` §3, §5, §7) | Stage 3 |
|---|---|---|
| `/api/hub` per-app flags | `mods: { weather, markets, fitness }` | `apps: { weather, chats }` |
| Page memory | `sessionStorage["ifl-mods"]` = on apps joined by `,` (beside `ifl-roof`) | `ifl-roof` becomes JSON |
| Frame | `F.session.mods`, `F.setRoof(on, app?)`, `roofs()` | `F.session.apps` |
| Server | `MODS`, `modOf(path)`, `RETIRE_SW(app)`, `retireWorker(request, app)` | `ROOF_DOCS` object, `retireScript(app)` |
| hub.sh | `wait_roof SITE want [secs] [app]` | `wait_roof SITE APP true\|false` |
| IndexedDB in a module (C5) | only in `<app>/roof/idb.js`, opening `REGISTRY[app].idb` | `core.js` opens `inflight` directly |
| Workers in a module (C5) | `new Worker(` only inside `fw.lazy(` | `service.js` makes it statically (and Today loads it outside `fw`) |
| Offline lazy files (C4) | `connector.lazy` | not used: lazy files never kept |

**Fix.** Rewrite stage 3 onto stage 2's names now: `mods.chats`, `ifl-mods`, `F.session.mods`, `F.setRoof(on, "chats")`,
`MODS` gains `chats`, `modOf` and `RETIRE_SW(app)` gain Chat's rules (no `?engine`, never `/chats/in/`, cache prefix
`inflight-shell`), `wait_roof SITE want [secs] chats`. For C5, name the smallest amendment as a **CONTRACT CHANGE**:
"`REGISTRY[app].service` names one file that may make one `Worker` at load; that Worker's graph may open
`REGISTRY[app].idb` from `<app>/roof/idb.js`". Then `REGISTRY.chats` gains `idb: "inflight"`, `core.js` imports
`./idb.js` (core-side, the `inflight`/`kv` shapes of `app.js:947-982`), and `roofcontract` stays one rule for every app.
Use C4 for offline (I9). Drop S3's three "whichever merges first" paragraphs: the forms are stage 2's.

### B2. The data that crosses the Worker boundary has no frozen shapes
§3.2 names the patch topics and §5.4 the method names, but neither gives shapes. CORE builds the producer, UI-A and UI-B
the consumers, and Q the fixtures, all at the same time. Missing:
- `chat:<id>` message view model: id, from (me/them/member id), at, kind (text/photo/voice/card/ask/plan/answer/when/
  view-once/system), text, flight state (flying, lands at, lost, waiting, way, kind of pigeon), reply-to, reactions,
  read/delivered, recall/expiry, card payload (already `normCard`ed), photo/voice ref, postmark/moment fields, older
  cursor;
- `rows` item (id, kind friend|group, name, avatar ref, unread, flying, pinned, `line`, at, keyChanged), `friends` /
  `groups` / `requests` items (handle, place shown or not, online/last seen, keyChanged, verified, blocked), `me`,
  `air`, `outbox`, `keywarn`, `typing:<id>`, `unread`;
- return shapes of `open`, `older`, `rows`, `sendText`, `sendBlob`, `share`, `rank`, `sendRun` progress (today's
  `renderSheet()` calls inside `sendRun`, `app.js:11667-11681`, become what?), `search` (title, sub, chat id, message
  id kept in the Worker), `safety`, `sessions`, `settings`;
- one `why` vocabulary for refusals and errors (`signin|key|locked|device|offline|ended|tap|card|failed|no`).

**Fix.** B0 writes them as a frozen table in `core.js`'s header (JSDoc typedefs), a fixture module
`.tools/tests/unit/fixtures/chats.mjs` holding one of each, and a stub core
(`.tools/tests/roofkit/chatcore-stub.js`, a Worker answering every RPC from the fixtures) that UI-A, UI-B, HOST and Q all
build against. `roofchatservice.test` checks that the real core's answers match the fixture shapes (keys and types).

### B3. Sheets and CSS have no single owner per file
- `chats.css` belongs to UI-A, yet UI-B's sheets (flight log, passport, Moon, map card, GIFs, voice, settings) need
  most of the ported CSS. Two batches would edit one file. **Fix:** split `chsheets.css` (UI-B: styles.css 918+,
  2269–2564 passport/Moon, 2402 Privacy & Security, 2526 Send sheet) from `chats.css` (UI-A: shell, lists, Messages,
  chat, composer). Add both to `REGISTRY.chats.css`. Budget ≤ 28 KB total.
- Sheets named in §2.2 with no file in §3.1: `birds`/`bird`/`birdname`, `feathers`, `loft` (Your Pigeons, Today's
  Pigeons), `groupadd`, `grouprename`, Coots, friends' news. `newmsg`/`newgroup` are claimed by `sheets.js` in §3.1
  but sit beside the list's New Chat act (UI-A).
- No opener exports are named. Stage 1 fixed this with "sheets are opened through exported openers in the file that
  owns their content" (S1 §7.1, RB5c). **Fix:** B0 writes a table and stubs. For example: `sheets.js: openFriendInfo(fw,
  svc, id)`, `openGroupInfo`, `openSafety`, `openNewChat`, `openNewGroup`, `openWhoHas`, `openView`, `openSchedule`,
  `openTimeTalk`, `openFromApps`; `flight.js: openFlightLog`, `openPassport`, `openMap`, `openLookUp`, `openWay`,
  `openMoonPick`, `openBirds`, `openLoft`; `media.js: openGifs`, `recordVoice`, `pickPhoto`; `scan.js: openScan`;
  `settings.js: openChatSettings(fw, svc, page?)`; `send.js: openSend(fw, svc, { card, words, to }) → Promise<{ ok,
  say } | { ok: false, why }>`. Each returns the sheet handle. `chats.js` and `chat.js` only call these through
  `fw.lazy`.

### B4. How a chat scrolls is not decided
Chat scrolls an inner `.view` (`styles.css:176` `overflow-y:auto`, the window kept at 0, `app.js:4747,4772`). It sticks
to the bottom (`S.stick`, `5093`) and fights iOS's keyboard scroll (`4659`). The framework scrolls the window: the
header compacts from `scrollY`, and `render()` calls `scrollTo(0, y)`, where a new push starts at 0 (`frame.js` render,
showApp). Ported as it stands, a newly opened chat would show its oldest message. Coming back to it would restore the
wrong end. The composer and keyboard behaviour would then depend on which model the builder picked.
**Fix (decide in the spec):** the list and Friends use window scroll like any screen. A chat calls `fw.fill(true)`
(S1 D20, `html.ifl-fill`: compact header, no window scroll) and owns an inner scroller sized from `visualViewport`,
with the composer fixed under it and the tab bar `.away`. The scroller starts at the bottom, keeps stick-to-bottom,
and anchors scroll when `older()` adds messages above. The frame skips its own `scrollTo` while `ifl-fill` is set (one
line in `render`, HOST). `hide()` calls `fw.fill(false)`. Add to `roofchatmount`: open, scroll up, leave, come back →
same message; keyboard up → the last message stays visible.

### B5. Send can't be built as written: the service has no sheet and no toast, and `wrap()` doesn't apply
- §5.5 says the service is "wrapped by the shared block's `wrap()` semantics already (`menu.js:595-606`)". It isn't.
  `wrap` is applied only inside the closure's `ready()` to the engine's own API (`menu.js:607`). Replacing
  `IFL.hub.chat` hands callers the raw service. So nothing calls `hub.sent(say)` after a sheet send. (The engine's sheet
  called `parent.IFL.hub.sent` itself.) `day.js:597` does toast after one-tap `sendTo`, so that path is fine.
- `service.share` must open a framework sheet with `send.js`. `startService({ path, onStale })` is given neither a
  sheet, nor `fw.lazy`, nor a toast. The roofcontract greps (no `IFL.`, `import(` only in `fw.lazy(`) forbid finding
  them any other way.
- **Fix (CONTRACT CHANGE, small):** `startService({ path, onStale, ui })`, where `ui = F.forModule("chats")` passed by
  `F.service` / `modules.loadService` (`sheet.open`, `lazy`, `toast` are the only members it uses). `share()` →
  `ui.lazy(() => import("./send.js")).then((m) => m.openSend(ui, svc, …))`. After a sent sheet, `send.js` calls
  `ui.toast(stillHere(say))`, with the same words as `menu.js:482` ("Sent to Pat. You’re still here"). `F.service`
  resolves the service whatever its state, because Today's callers already check `state === "ready"` (`menu.js:541`,
  `day.js:330,592`). Say in §5.5 that `wrap` does not apply and list what replaces each part of it.
- §2.1/S3-D7's "not ready → the sheet says why" is reached only by the `/chats/#share=` route, because `IFL.hub.send`
  navigates there whenever `state !== "ready"` (`menu.js:541-543`). Say so. Spell out what the Send sheet shows at
  `/chats/#share=` in each state (`signin`, `key`, `locked`, `device`, `offline`).

### B6. B0's list is missing the pieces that let the wave start at once
§11.1's B0 freezes REGISTRY, router, hooks, roofcontract, stubs and the RPC list. Add: B2's view-model table, fixtures
and stub core; B3's opener stubs and the CSS split; the `startService` signature and `Service` interface (B5); a
`frame.js` stub for `F.service`, `fw.service`, `fw.tabs.away/badge` and `header.set({ sections: null })` that resolves
to the stub service on the kit page; and an owner for every test file that "must change" (I10). Without these, UI-A and
UI-B can't mount anything until CORE and HOST merge, and the plan stops being parallel.

---

## IMPORTANT

**I1. Make the budgets real.** Set the core's own code at ≤ 36 KB gz, the core graph at ≤ 55 KB and Today's idle start
at ≤ 58 KB (all against the 270 KB engine). Keep page JS ≤ 110 KB and CSS ≤ 28 KB. Load `rank.js` lazily inside the
core (only Send needs it: −3.1 KB at idle). Record the measured figures in `roofchats` part 10 from the first build,
not at I. Stage 1 spent an integration round raising 90 → 110 KB.

**I2. The core's script is never cached.** `new URL("./core.js", import.meta.url)` drops `service.js`'s `?v=`, so
`core.js` is fetched `no-store` (`_app.js:107-112`) on every Worker start, including Today's idle start on every visit.
**Fix:** `stampImports` also stamps `new URL("./x.js", import.meta.url)`. Limit it to files under `/roof/` if
standalone output must stay byte-identical: `crypto.js:58` has the same pattern for `argon2w.js`. `roofchatserve`
pins it, and the root worker's `moduleFile` already matches by pathname.

**I3. `crypto.js` makes its own Worker** (`argon2w.js`, `crypto.js:58`). So "only `service.js` makes a Worker" fails
as soon as roofcontract walks the core graph. Exempt the reused `../crypto.js` by name. Note it's a nested worker
(Safari 15.5+). Where one can't be made, it falls back to running in the core, which is still off the page.

**I4. Back and tab rules for an app that is a tab.**
(a) Cold Back from `/chats/#open=<id>` (a push tap, depth 0) goes to `/#apps` (`frame.js` `nav.back`); it should go to
`/chats/`. (b) Tapping Chats from Today gets a `push` transition (`kind` is `tab` only when both routes are tabs); it
should cross-fade like Today/Apps/You. (c) `tabs.js` `click` handles only `TAB_SCREENS` (`tabs.js:10,46`), and Chats
must join it while on. (d) Inside a chat, the Chats tab is hidden (composer up), so "tapping Chats in a chat" (§2.1) only
happens with the keyboard down if the tab bar stays away. Pick one. (e) The root route's crumb is unspecified: Today's
is the date, an app's its name. Suggest none. Write all five into §4.1 as HOST's rules.

**I5. When `IFL.hub.chat` is swapped matters.** If any `hub.chat()` call runs first (`day.js` `listen` at idle,
`app.js:1203`, `:1573`), the engine iframe is made anyway: 270 KB, and `roofchats` part 5 fails. **Fix:** set the
override synchronously as soon as the Chats flag is known: from the kept `ifl-mods` at boot, before the frame renders
Today, and again in `applyHub`. When Chats turns off, put the original back and call `dropEngine`-equivalent cleanup.

**I6. The tab bar colour contradicts the brief and the spec's own test.** The brief says the tab bar "can then take
InFlite's indigo". The spec defaults to following each screen's accent, and also says `roofnav`'s pixel-equality check
becomes "framework Today vs framework Chats", which can't hold if Today is indigo and Chats is blue. **Fix:** default to
indigo everywhere: under `.ifl-tabs.has-pill`, `--ifl-tab-on` is set from `[data-app="inflite"]`'s `--acc-ink`, scoped
to the tab bar so it doesn't change with `html[data-app]`. The pixel check holds, there's one token instead of a colour
change on every screen change, and "follow the screen" can stay as George's question 1.

**I7. Some states have no screen.** §2.1 has `key`, locked and computer. Add `signin` (Chat token missing although
InFlite is signed in), `ended` (401 mid-session), `offline` with nothing cached, the Worker failing to start or
`F.service` rejecting (use S1's `ui.error` with Try Again / Open Chats on Its Own → chat.inflite.ai, as Weather's), and
first run with no friends (Chat's empty list today: "Add a friend" with your link). Give each one's words and one
action.

**I8. Two searches on one screen.** The list keeps Chat's own search field (§2.1), and the header's Search also finds
messages (§2.4). Weather has no in-page search. **Fix:** the list's field is a button that opens the framework's
Search sheet focused, with People and Messages first. Same results, one code path (`chatsProvider`), nothing lost.

**I9. Offline gets worse.** Chat's own worker keeps all of `app.js`, so friend info, safety numbers, settings and the
Send sheet work offline today. §7 keeps no lazy file. **Fix:** list `send.js sheets.js settings.js media.js` (and
`chsheets.css`) in stage 2's `connector.lazy` (C4) so the root worker keeps them. Leave `flight.js`, geodata,
`jsqr.js` and GIFs network-only ("Needs a connection"). `files ∪ lazy` ≤ 60.

**I10. Test files with no owner.** §10.2's "must change" list (`roofnav.mjs`, `hubshare.mjs`, `hubserve.mjs`,
`mocks/todaystub.mjs`, `roofshell.mjs`) names no batch. Neither does the kit page's stub-core host (`roofkit/**` is
FW's in stage 1). Assign them as in stage 1: hubserve/hubstack → SV; todaystub/roofshell/todayshell → HOST; roofnav/
hubshare/rooflib → Q; kit additions and the stub core → B0, then HOST.

**I11. Pin the storage shapes, not only the E2E functions.** Rollback (§8) and "same data" (S3-D4) depend on the core
writing `cache:`, `drafts:`, `outbox:`, `pins*:` exactly as `app.js` reads them, and the other way round. The parity
test pins only the decrypt and trust functions. **Fix:** add golden fixtures to `roofchatcore.test`: write with the
core, read with `app.js`'s functions (run in isolation, as `engine.test` does), and the reverse. Make one outbox
written by each flush through the other.

**I12. Who hears the root worker.** `{inflight:"sync"}` (`sw.js:228-233`) goes to windows. A dedicated Worker can't
receive it, and the page has no `navigator.serviceWorker` listener for it once the engine page is gone. **Fix:**
`service.js` owns one `navigator.serviceWorker` `message` listener (removed on `release()`), forwards `sync` to the core
as a quiet sync, and passes `pushTag` on.

**I13. Things the spec says that aren't true or contradict each other.** S3-D6 "day.js unchanged" vs S3-D14's
`forgetHeard()` export. S3-D11 "two lines" in `pigeon/app.js` vs §6.4's SW condition plus a new "no `then` → go to
`/chats/`" default (`2837`, `12436`), which is new logic. Say so and test it. §3.2 "`Blob`s (transferred)": Blobs are
cloned, not transferable (fine, just say cloned). §5.5's `wrap` claim (B5). The 1 s ticker (S3-D10) is view code and
belongs in the page, not the core. Name its owner (`chat.js`/`list.js`).

**I14. The framework byte budget needs raising in stage 2's B0, not "whichever stage first".** `roof/*.js` is at
20 453 / 20 480 B, and stage 2's `roofs()`/`setRoof(app)` changes alone pass it. Stage 3's share (tab-module header,
`keep`/`raw`, badge/away, `loadService`, `chatsProvider`, fill-skip) is more like 2–2.5 KB than 1.5. Ask stage 2 to set
24 KB and record why. Stage 3 checks it still fits.

**I15. Search providers.** `fw.search.provide` turns Weather's Places provider off whenever any module has a provider
(`frame.js` `places()`, `:403-406`). If Chats registers through `fw` while Weather isn't mounted, Places disappears.
**Fix:** as §2.4 already half-says, `chatsProvider` is the frame's, in `connectors.js`, and never goes through
`fw.search.provide`. Also change `places()` to check only Weather's providers.

**I16. Lost or changed behaviour: list it and put it in `APP_NEWS`.** No pull to refresh (sync every 15 s instead), no
swiping between Chats and Friends, no Chat back-edge outside Home Screen mode, no Appearance setting inside InFlite, hold
menus become action sheets, Chat's toasts become the framework's. Each matches Weather (S1 D19). Chat's
`toast(esc(html))` calls (≈ every sheet) become `fw.toast(text)`. The builder must not pass HTML. The toast sits above
the composer while the tab bar is `.away`: a CSS rule for HOST.

**I17. Root worker details.** `ROOF_DOCS`/`FRAMEWORK` match by pathname only (`sw.js:46,294,303`), so offline
`/chats/?engine=1` (the engine frame on a milestone-1 page) would get the kept framework page inside the frame.
Exclude a search containing `engine`, and never treat `/chats/in/` as a framework window.

**I18. Two writers to one outbox.** The core in the framework tab and Chat's own page (`/chats/in/`, or the engine on a
milestone-1 page in another tab) can both flush `outbox:<uid>`. That already happens today (Chat tab plus engine), and
`sendRun` reuses a letter's id. Still, take a Web Lock (`navigator.locks.request("inflight-outbox", …)`, available in
Workers) around the core's flush. One line, and it covers the new Worker.

---

## Proposed batch split (B0, then six in parallel, then I)

Rules as stage 1 §9.3. Each file has one owner, and ❄ means frozen after B0.

| Batch | Owns (IFL) | Owns (MAIN) | Needs | Done when |
|---|---|---|---|---|
| **B0 contracts** (serial, ≈ ½ day) | `today/public/roof/router.js` ❄ (REGISTRY.chats on stage 2's C2: `tab, id, keep, raw, service, idb`; `keep`/`raw`/`hash`; `?engine` and `/chats/in/` not ours); stubs in `frame.js` (`F.service`, `fw.service`, `fw.tabs.away/badge`, `sections: null`) → HOST | `pigeon/roof/*` stubs with frozen exports (B3 openers; `startService` + `Service`; `core.js` header: RPC table, view models, `why` list, `PROTOCOL`); `chats.css`/`chsheets.css` empty scoped files; `.tools/tests/roofhooks.mjs` ❄; `unit/roofrouter.test.mjs` ❄; `unit/roofcontract.test.mjs` ❄ (chats params, C5 amendment, crypto.js exemption); `unit/fixtures/chats.mjs` ❄; `roofkit/chatcore-stub.js` + kit page wiring → HOST | stage 2 merged | unit suite green with both IFL states; kit page mounts the stub Chats module and opens one stub sheet per opener |
| **CORE** (deep review) | – | `pigeon/roof/core.js`, `idb.js`, `service.js`; `unit/roofchatcore.test.mjs` (parity of S3-D5's list + storage goldens I11 + RPC refusals + no message word in any URL/header), `unit/roofchatservice.test.mjs` (keys = `makeIFLChat`'s, tap rule, protocol stale, restart queue, answers match fixtures) | B0 | both tests green; `node --check`; the stub core can be swapped for the real one on the kit page with no UI change; reviewer signs off |
| **UI-A** list, friends, chat | – | `pigeon/roof/chats.js`, `store.js`, `list.js`, `friends.js`, `chat.js`, `connector.js`, `chats.css`; `unit/roofchatviews.test.mjs` (with `roofkit/fakedom.mjs`); `.tools/tests/roofchatmount.mjs` | B0 | `roofchatmount` green on the stub (list, chat, composer, B4 scroll and keyboard, `.away`, axe, 320/390/1280); greps clean; static graph ≤ 110 KB gz |
| **UI-B** sheets, Send, settings | – | `pigeon/roof/send.js`, `sheets.js`, `flight.js`, `media.js`, `scan.js`, `settings.js`, `chsheets.css`; `unit/roofchatsheets.test.mjs` (fakedom: each opener draws, escapes, no inline styles) | B0 | unit green; every §2.2 sheet opens and closes on the kit page by hook; Send's states (B5) drawn |
| **HOST** framework + Today | `today/public/roof/frame.js tabs.js modules.js connectors.js header.js roof.css`; `today/public/app.js you.js day.js` | `unit/roofui.test.mjs`, `roofkit/**` (after B0), `.tools/tests/roofshell.mjs todayshell.mjs todaypage.mjs mocks/todaystub.mjs` | B0 (stub service) | I4/I5/I6/I15 rules in; `roofshell` + `todayshell` green with the stub service; `roof/*.js` within the raised budget; `wrangler deploy --dry-run` ok |
| **SV** server, worker, switch, MAIN serving | `today/src/hub.js roof.js`, `today/public/sw.js`, `today/public/_headers` | `functions/_app.js` (`../` + I2), `functions/_middleware.js` (`/_hub/in/`), `pigeon/app.js` (SW guard + `then` default only), `.github/workflows/roof.yml`, `.github/hub/hub.sh`, `.tools/tests/hubstack.mjs hubserve.mjs`; unit `roofserve hubworker hubheaders todayfiles rootsw todaysw roofchatserve` | B0 | unit green; standalone output byte-identical (except any I2 opt-in); roof.yml simulator passes `app=chats` off/on; dry run ok |
| **Q** acceptance | – | `.tools/tests/roofchats.mjs roofchatnav.mjs rooflib.mjs roofnav.mjs hubshare.mjs` | B0 (hooks, fixtures) | tests written and `node --check`ed; run first at I (e2e slots) or in a cloud session against the merged branch |
| **I** integration | Today `BUILD`/`NEWS` | `APP_VERSION`/`APP_NEWS` + `chats.js` `BUILD`/`NEWS`, `min/**` (`node .tools/minify.mjs`), `suite.txt`, README, `golive.md` | all | full unit; e2e in halves on two sessions (R3); standalone Chat e2e unchanged green; budgets recorded |

Merge order: SV and CORE first (independent, and they unblock real-stack e2e), then HOST, then UI-A, then UI-B, with Q
running against the merged branch. That's six parallel batches with disjoint files. The spec's eight (FW3 and TD3
apart, CH apart) merge into HOST and SV because each piece is small and they share one reviewer's context. Deep review
covers CORE (with `service.js`) and the HOST diffs in `frame.js`/`tabs.js`/`app.js` only (R3).

---

## What makes the whole process faster (George's question)

1. **Write stage 3 onto stage 2's shapes now** (B1). Reconciling `mods`/`apps`, C4/C5 and `wait_roof` during B0 or at
   integration is the most likely single delay.
2. **Freeze the boundary in B0 with a stub core** (B2, B3, B6). Then UI-A, UI-B, HOST and Q need nothing from CORE and
   all start the same hour. CORE's verbatim port can even start before B0 finishes, since its files only depend on the
   RPC table.
3. **Six batches, not eight**: fewer merges, fewer worktrees, fewer review hand-offs. Same file isolation.
4. **Decide the open UX now** (B4 scroll, I6 indigo, I7 states, I8 one search) so builders don't guess and reviewers
   don't bounce work back.
5. **Real budgets up front** (I1, I14) remove the "missed, record why, raise" loop that cost stage 1 a round.
6. **Kit-page tests on the stub run anywhere.** Run `roofchatmount` and the sheet checks in the extra cloud sessions
   (R3), keep the two local e2e slots for the hub-stack tests at I, and run the full suite in halves only once.
7. **Deep review only CORE and the shared HOST diffs** (R3). Everything else gets the unit suite and the named e2e.
