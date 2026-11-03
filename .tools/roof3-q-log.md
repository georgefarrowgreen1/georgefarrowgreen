# One roof stage 3 · batch Q (acceptance tests): log

Branch `r3/q` in both repos (made from `claude/one-roof-24`, B0's `r3/b0` merged in as it landed: core header, stubs,
fixtures, router, frame stubs, contract tests, hooks). Q's files are all MAIN's; IFL's `r3/q` carries only B0's merge.
Brief: `roof/s3/handoff.md` "Q · Acceptance tests", spec §10.2, critique I14, with `s24-contracts.md` overriding (see
"Decisions").

## Files (all `.tools/tests/`)

| File | Status | What it proves |
|---|---|---|
| `roofchats.mjs` `// needs: hub roof-chats` | new | spec §10.2 parts 1–13 (below) |
| `roofchatnav.mjs` `// needs: hub roof-chats` | new | spec §10.2 parts 1–4 (below) |
| `rooflib.mjs` | extended | `chatPhone()`, `CHAT_LAZY` (+ `CHAT_PAGE`, `CHAT_CORE`, `CHAT_CSS` graphs), `workers(p)` counter, `hunt()` sentence scanner, `kept()`, `chatApi`, `chatSession`, `befriend`, `noteRequests`; `connectorFiles/Lazy/moduleBuild('chats')` read `pigeon/roof/` |
| `roofnav.mjs` `// needs: hub roof-chats` | changed | reads `/api/hub apps.chats`: on → Weather→Chats in the page, a tap with Chats open routed in the page, the hub-page tab checks become the framework's own tabs, pixel check framework Today vs framework Chats (S3-D16); off → stage 1's checks unchanged |
| `roofnavoff.mjs` `// needs: hub` | new (2 lines) | runs `roofnav.mjs` with Chats off: the switched-off path, exactly today's |
| `hubshare.mjs` `// needs: hub roof-chats` | changed | on: every card through the module's Send sheet (framework pages; Markets' milestone-1 page keeps its engine, S3-D6), Today's facade instead of the engine frame, no engine frame, locked Send → the module's lock; the three milestone-1-only steps (6b Write More, 8 forced key, 9b links in Chat's own page) print a `note:` naming where the module's version is proved, never a PASS. Off: unchanged |
| `hubshareoff.mjs` `// needs: hub` | new (2 lines) | runs `hubshare.mjs` with Chats off |
| `todayauthoff.mjs` `// needs: hub` | new | risk B1 / §8: sign-in through milestone 1's `/chats/` with Chats off, in a browser (`todayauth.mjs` is API-level and never touches `/chats/`, so its first line couldn't carry this; it is unchanged) |

Every selector is `roofhooks.mjs`'s; each test resolves Chats' hooks through `hk(name)`, which turns a hook that isn't
there into a failure that names it (never a selector of our own). Chat's own page (Pat's, Leo's, milestone 1's) is
driven by its own markup (`#msg`, `.send`) as the standalone tests do. Declared exception: `SAID` = Today's
`.dt-said/.dw-said` (TD's day.js markup, named by spec part 9), in `roofchats.mjs`.

### roofchats parts (each names its decision in its header line)
1. Chats tab in the page (no document fetched), `data-route`/`data-app`, tab-screen header (photo, title, no crumb/Back,
   switcher), tab current, header line has no words, Pat's row, the tab bar's `--ifl-tab-on` and current colour equal on
   Today and Chats (S3-D16), one Worker = chats-core, no engine frame, the facade = exactly makeIFLChat's 7 keys, frozen,
   no `call`/`on`, ready; Friends via the switcher.
2. Open a chat: `#open=` kept, Back "Back to Chats", no switcher, `TABS_AWAY`, one scroller; George sends → bubble → one
   letter in the DB → Pat reads it on Chat's own page; Pat answers → drawn live; Back → list, no bubble left in the page,
   one Worker.
3. Deep links of §2.3 (open, friends, requests, add, settings, account, flightlog, index.html, `/chats` 301), each one
   Worker and no engine; unknown `#open` → list + "That chat isn’t on this phone"; `#share=…&card=…&back=` → Send sheet,
   words out of the address at once.
4. Weather Now's Send → module's Send sheet in the same page, "Sent to Pat. You’re still here", one letter, one Worker;
   Today's one tap → sent; no tap → `why: "tap"`; Leo's key changed (DB) → the sheet instead, nothing sealed.
5. Today's Waiting words (no engine frame), the Chats tab badge a number only, `waiting()` shape, every `/api/pigeon/`
   call quiet=1 and no `read`, letters still unread in the DB, nothing new kept on the phone, `since(t)`.
6. Search People (Pat, "Chats") and Messages (a snippet), the query in no request from any frame or Worker, the result
   opens the chat with no message id in the URL.
7. `hunt()` for every sentence sent or typed (+ the query) in all requests (URLs, bodies; every phone, frame, Worker),
   `hostpass.jsonl`, every stack log, George's storage outside Chat's own `inflight` IDB; no `today:*` change; no new
   localStorage key beyond `ifl-*`/`inflight-*`; the token in no DOM/storage/`IFL.hub`, no URL or body; bearer only on
   Chat's API.
8. A second phone with George's InFlite cookies, no Chat key → `CH_UNLOCK` → through `/chats/in/` → back at `/chats/`
   unlocked (the list with Pat), facade ready.
9. App lock at boot: no `.dt-said/.dw-said` words, no `messages?with=` before unlock, facade `locked`, `CH_LOCK` on the
   Chats tab, no words in the screen; mid-session (hide/show with lock Immediately): lock screen, bubbles and words gone,
   Search finds nothing. (Unlock is lock.js's passkey check: the test takes the lock off instead, noted.)
10. Budgets on a cold phone: Today idle = no Chats UI, service.js + core graph ≤ 58 KB; first Chats open page JS ≤ 110,
    CSS ≤ 28, core own ≤ 36, core graph ≤ 55; no lazy file; nothing fetched twice; every file in `connector.files`;
    `files ∪ lazy` ≤ 60; warm tab → list ≤ 600 ms. Unminified files measured as minify.mjs would send them (`meter`).
11. `/chats/version` says a newer build: with text typed no reload and the text kept; empty, the next route change
    reloads once.
12. Two phones 390 light/dark: axe on list, chat, Friends; no sideways scroll; no CSP refusal (and on George's page).
13. Server-side logout → `chState('ended')` + Sign In, 0 Workers, no engine, no words left.
Plus: every hook present; no CSP violation and no page/console error on George's pages.

### roofchatnav parts
1. Chat push taps via the root worker: framework open with a sheet up → `#open=` in the page, sheet closed, same document,
   one Worker; `#requests` → Friends + Requests; any other → list; no window → `openWindow(/chats/#open=<id>)` → that chat.
2. Chats off mid-session (client side stood in with routes: `/api/hub` apps.chats false, `/chats/roof/*` 404, `/chats/`
   navigations → Chat's hub copy from the site, as the hub forwards it when off): (a) Weather showing: Chats unmounted,
   core 0, Weather still mounted, same page; `IFL.hub.chat` original (makes the engine); the Chats tab navigates.
   (b) A letter queued in the core while its POSTs fail; switch off → one bounce to milestone 1's page (marker
   `ifl-roof-bounce`), which sends the queued letter once; Pat reads it.
3. A stand-in for Chat's old `/chats/` worker: unregistered by the framework page without a reload, one core Worker; the
   hub's retire script (an update) with a framework window open: gone, window not reloaded; `/chats/in/` never
   navigated to; offline: the list and an opened chat from what's kept (Home Screen phone).
4. `/chats/#signin= #verify= #invite= #reset=` → `/chats/in/` same hash (no query); the whole trip round (through
   `/chats/in/` both ways, back unlocked); `/chats/in/` and `/chats/in/#open=` with a session → `/chats/…` under the roof;
   `/chats/in/#account` stays Chat's page. Plus a `hunt()` for the queued letter.

## Decisions
- **The switch is opt-in** (s24 §1 overrides spec §8's `ROOF_OFF_CHATS`): Chats on = `ROOF_CHATS "1"` = hubstack's
  existing `roof-chats` flag (any `roof-<app>`, no hubstack change needed). Off = absent = plain `// needs: hub`. So the
  spec's `roof-off-chats` is just `// needs: hub`, and `todayauth`'s first line already runs with Chats off; the browser
  trip is `todayauthoff.mjs`.
- `roofnav`/`hubshare` must prove Chats on (spec §10.2), and the off path must stay proved: each reads `apps.chats` from
  the hub and branches; its first line is `roof-chats`; a 2-line `*off.mjs` runs the same body with plain `// needs: hub`.
  Before SV merges, `roof-chats` still yields `apps.chats` absent, so `roofnav`/`hubshare` run their off branch (as
  today) and stay green.
- New files `roofnavoff.mjs`, `hubshareoff.mjs`: not in the brief's file list (the brief allowed `todayauthoff`), added
  for the off path; the integrator decides whether `suite.txt` gets them.

## What ran (on `r3/q` with B0 merged; SV, CORE, UI-A, UI-B, HOST not merged)
- `node --check` clean: `roofchats`, `roofchatnav`, `rooflib`, `roofnav`, `roofnavoff`, `hubshare`, `hubshareoff`,
  `todayauthoff`. Every name each test imports from `rooflib.mjs` exists; every hook it names is in `roofhooks.mjs` but
  `CH_SEND_WORDS` (below).
- Unit suite (`node --test .tools/tests/unit/*.test.mjs`): 1303 tests, 1295 pass, **1 fail**, 7 skipped. The fail is
  `min.test` ("every app script and stylesheet has a minified copy"): B0's new `pigeon/roof/*`, allowed until I (rule 4);
  none of Q's files is minified.
- e2e `./run.sh todayauthoff roofnavoff` (Chats off):
  - `todayauthoff`: **FAILS 1**, 12 PASS. The trip through milestone 1's `/chats/` works end to end (signed in, Chat's
    session and key on the phone, no `/chats/in/`, engine ready, no core Worker, Sign In href unchanged). The fail:
    `/chats/roof/chats.js` answers **200** with Chats off (§6.2/§8 want 404 no-store): **SV** (the hub's off branch
    for `/chats/roof/*`; MAIN now has B0's stubs there, so the forwarded file exists).
  - `roofnavoff`: **FAILS 1**, 41 PASS. Every navigation check passes; the fail is a console error on framework Today:
    `Transition was aborted because of invalid state. Page already revealed` (the frame's view transition): **HOST/FW**
    (stage-1/2 code; roofnav's off branch is stage 1's checks unchanged).
- e2e `./run.sh hubshare roofchats`: see "Second run" below.

## Needs from others
- **B0 / integrator**: a hook for the Send sheet's words field (`CH_SEND_WORDS`, UI-B's `send.js`; Chat's `#f-sendwords`):
  `hubshare` types the card's words there. Until it exists, hubshare fails it by name.
- **SV**: `/chats/roof/*` 404 no-store with Chats off (todayauthoff part 1, spec §6.2, §8).
- **HOST/FW**: the view-transition console error on framework Today (roofnavoff).
- **I**: `suite.txt` gains `roofchats roofchatnav todayauthoff` (+ `roofnavoff hubshareoff` if wanted); `roofnav` and
  `hubshare` now start the stack with `roof-chats`.
- Everything else in `roofchats`/`roofchatnav` needs SV (MODS chats, `/api/hub apps.chats`, the doc, the retire worker),
  CORE (the real core: sends, sync, search, lock, waiting), UI-A (list, chat, lock, states), UI-B (Send, sheets) and
  HOST (F.service, tabs, badge, away, hop, retireOld) merged: the full run is at I, with each failure handed to its owner.
