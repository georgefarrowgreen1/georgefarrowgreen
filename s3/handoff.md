# One roof, stage 3 (Chats under the roof): briefs for each batch

One brief per batch. Each is meant to be followed with `s3/spec.md` (beside this file), `roof/addendum.md` (which wins
over both), stage 2's `roof/s2/spec.md` (its contract changes S2 C1–C5 are merged before stage 3 starts) and the code
files it names. Section numbers (§), decisions (S3-Dn) and contract changes (S3-Cn) are `s3/spec.md`'s. Read "Every
batch" first, then your own brief.

- MAIN = the `georgefarrowgreen` repo (Cloudflare Pages: Chat in `pigeon/`, Weather, Fitness, Markets, the account page,
  server code in `functions/`). IFL = the `inflite` repo (the Worker at `inflite.ai`: Today in `today/`, Mail in
  `email/`).
- ROOF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof`; S3 = `$ROOF/s3` (this folder:
  spec, critiques, logs). TF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf` (`e2e.sh`,
  `i0-wfsim.py`, results under `state-<name>/`).
- The integration branch is **`claude/one-roof-s3`** in both repos, made by the integrator from `claude/one-roof` once
  stage 1 is live, with stage 2's integration branch (and stage 4's if merged) merged in. The integrator's checkouts are
  `/home/user/up4/roof3/int/{georgefarrowgreen,inflite}`. **Batches never edit them**: only the integrator merges.
- The read-only reference checkouts `/home/user/up4/tf/{georgefarrowgreen,inflite}` (`claude/one-roof`, MAIN `0eb3506`,
  IFL `dee9d49`) are where the spec's `file:line` citations were taken.

| id | Batch | Wave | Starts after | Deep review (R3) |
|---|---|---|---|---|
| `b0` | B0 · Contracts | 0 | stage 2 merged into `claude/one-roof-s3` | – |
| `core` | CORE · Worker core and service | 1 | B0 merged (may read and draft from B0's RPC table as soon as B0 pushes it) | **yes** |
| `uia` | UI-A · Entry, list, Friends, chat | 1 | B0 merged | – |
| `uib` | UI-B · Sheets, Send, settings | 1 | B0 merged | – |
| `host` | HOST · Framework and Today | 1 | B0 merged | **yes** (`frame.js`, `tabs.js`, `app.js` diffs) |
| `sv` | SV · Server, root worker, switch, MAIN serving | 1 | B0 merged | – |
| `q` | Q · Acceptance tests | 1 (write) / I (run) | B0 merged | – |
| `i` | I · Integration | 2 | run by the integrator, merging each batch as it goes green | – |

All six wave-1 batches start the same hour: they build against B0's frozen names, fixtures and stub core, never
against each other's files.

---

## Every batch

### Set up

Every batch, B0 included, makes its own pair of worktrees side by side (MAIN's tests look for IFL at `../inflite`), on
`roof3/<id>` off `claude/one-roof-s3`:

```sh
B=core                                 # your batch id: b0 core uia uib host sv q
W=/home/user/up4/roof3/wt/$B
ROOF=/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof
TF=/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf
INT=/home/user/up4/roof3/int
S3=$ROOF/s3
mkdir -p $W
git -C $INT/georgefarrowgreen worktree add $W/georgefarrowgreen -b roof3/$B claude/one-roof-s3
git -C $INT/inflite          worktree add $W/inflite          -b roof3/$B claude/one-roof-s3
ln -s /home/user/up4/tf/georgefarrowgreen/.tools/tests/node_modules $W/georgefarrowgreen/.tools/tests/node_modules
ln -s /home/user/up4/tf/inflite/node_modules                        $W/inflite/node_modules
ln -s /home/user/up4/instant/inflite/email/node_modules             $W/inflite/email/node_modules
cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs   # baseline: note pass/fail/skipped
```

If the worktrees already exist (a fix round), `cd` into them and carry on. To pick up batches already merged:
`git -C $W/georgefarrowgreen merge claude/one-roof-s3` (and the same in `$W/inflite`), before any test your brief says
needs another batch.

### Run things

- All unit tests (MAIN's and the IFL-reading ones, from MAIN): `cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs`
- One unit test: `node --test .tools/tests/unit/<name>.test.mjs`
- Module loading (if you touched anything a server imports): `node .tools/tests/unit/imports.test.mjs`
- Parse check: `node --check <file>` for every `.js`/`.mjs` you changed.
- IFL Worker dry run (any IFL change): `cd $W/inflite && npx wrangler deploy --dry-run --outdir $S3/dry-$B` (SV also
  `--env next`).
- Gzip sizes (budgets, §5.6): `$ROOF/s4/tools/gz.mjs` or `gzip -9c <file> | wc -c` on a minified copy made in a scratch
  folder (never write `min/`: that's I's).
- **End-to-end tests, only through the isolated runner, only the tests your brief names:**
  `$TF/e2e.sh $W/georgefarrowgreen <name> <test> [<test>…]` with `<name>` = `s3-<id>` (or `s3-<id>-<n>` to keep an
  earlier run). Results: `$TF/state-<name>/results.log` ("FAILS 0" is a pass; a hub test that prints `SKIPPED` is
  **not** a pass); logs `$TF/state-<name>/<test>.log`, screenshots `$TF/state-<name>/out/<test>/`. At most two runs
  machine-wide (the runner waits for a slot); put all your tests in one call. Kit-page tests (`roofchatmount`,
  `roofkit`) may instead run in an extra cloud session (R3) if the integrator gives you one. Never the full suite.
- e2e tests select DOM only through `.tools/tests/roofhooks.mjs`. A hook you need that isn't there: report it, don't
  invent a selector into another batch's markup.

### Rules

1. **Edit only the files your brief says you own.** If you need a change in someone else's file, stop and report it in
   your hand-off (`needsFromOthers`); don't make it.
2. **The names other batches use are fixed** by B0 (❄ below; every export, opener, RPC method, patch topic, data shape,
   `why` word, hook and fixture in spec §2.2, §3.1, §5). Keep them; add, don't rename. A shape you need to change is a
   `needsFromOthers` to the integrator, who changes B0's files and tells everyone.
3. **Never** push; never bump a version (`BUILD`, `NEWS`, `APP_VERSION`, `APP_NEWS`); never run `node .tools/minify.mjs`,
   `node .tools/wxshell.mjs`, `node .tools/iflmenu.mjs` or `node .tools/signin.mjs`; never edit `.tools/tests/suite.txt`.
   Integration does all of that. Nobody edits `.tools/inflite/menu.*`, `email/**` or stage 4's Mail files.
4. Until integration, `min.test.mjs` and `wxshell.test.mjs` may be red, only for files you changed. Every other unit test
   is green in both IFL states: a MAIN unit case that needs stage 3 in the IFL beside skips with `roofSkip` (from
   `unit/fixtures/roof.mjs`, extended by B0 with `chatsSkip`) and says why; a rewritten case keeps its earlier assertion
   for the other state.
5. **Privacy, always:** no message words, no Chat place names and no Markets amounts reach a server, a request URL or
   body, a push, `localStorage`/IndexedDB under `today:*`, or a log. Chat stays end-to-end encrypted: the token, keys,
   pins, ciphertext and other chats' plaintext never leave the core Worker (S3-D3); no password, PRF output or JWK ever
   enters it (S3-D8). Search is on device only. Every string from data goes through `textContent` or `esc()`. No inline
   styles or inline handlers.
6. **Each app keeps working at its own address.** chat.inflite.ai and `georgefarrowgreen.com/pigeon/` behave exactly as
   today; hub mode keys on the server's marker (`IFL.hub.on`), never on the hostname.
7. Words on screen: British English, plain words, title case on buttons as the apps already do ("Unlock Chats", "Try
   Again", "Open Chats on Its Own").
8. **No model names or model IDs** anywhere: not in commits, code, comments, logs or test names.
9. Commit on `roof3/<id>` in each repo you changed: small commits with plain messages, each ending with exactly:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_014XnqoGQHbED3n4J5zbYg9i
   ```
10. Work fast (R1): build what your brief and the spec ask, prove it with the checks named, nothing more. Don't run an
    e2e test your brief doesn't name.
11. Append a short log to `$S3/<id>-log.md` (what you built, decisions, commands and counts, measured sizes where your
    brief asks, what's left). When done, report: what you built, test commands and results (unit pass/fail/skipped, each
    e2e `FAILS n`), commits, anything not done and why, and `needsFromOthers`.

### What "Done when" means

Every item proven by a command you ran in your own worktrees on your final commit, with counts in your report. "FAILS 0"
for each e2e named; unit suite 0 failing (skips only with their stated reason); `node --check` clean; dry run ok where IFL
changed.

---

## B0 · Contracts

**Goal.** Freeze every name, shape, file, opener, hook, fixture and test helper more than one batch uses, and give the
kit page a stub core, so all six wave-1 batches start at once and none edits another's file. Nothing user-visible
changes. Serial, alone, about half a day.

**Read first:** spec header, §0, §1 (all), §2.2, §3, §5 (all), §10, §11.1; `s2/spec.md` §3 (C1–C5 as merged) and
`s4/spec.md` §5 C2–C4; `$ROOF/handoff.md` B0 (stage 1's pattern); MAIN `pigeon/app.js` (`makeIFLChat` 810-820, state
910-927, IDB 947-982, the `api(` call sites for `META`), `.tools/tests/unit/roofrouter.test.mjs`,
`roofcontract.test.mjs`, `fixtures/roof.mjs`, `.tools/tests/roofkit/**`; IFL `today/public/roof/router.js`,
`frame.js` (the `fw` comment block at the top).

**Owns** (and hands on; ❄ = frozen for everyone after you):
- IFL: `today/public/roof/router.js` ❄ (`REGISTRY.chats` exactly spec §5.1; `tab`, `id`, `raw`, `service`, `skip`;
  `route.hash` for `raw` keys; `skip` makes `/chats/in/…` and `?engine` URLs not ours). Stubs in `frame.js`/
  `modules.js`/`tabs.js` (→ HOST): `F.service(app)`, `F.releaseService(app, o)`, `fw.service()`, `fw.tabs.away/badge`,
  `fw.on("push")`, `opts.retired`, `opts.serviceState`, present and inert (resolving to whatever `startService` gives;
  on the kit page, the stub core).
- MAIN `pigeon/roof/` stubs with frozen exports (→ owners): `chats.js` (`CONTRACT`, `BUILD`/`NEWS` = `pigeon/app.js`'s
  current `APP_VERSION`/`APP_NEWS`, `PROTOCOL = 1`, `SECTIONS` ❄, `mount` returning a placeholder instance with every
  method, `STUB = true`), `connector.js` (final shape ❄: `shares` words, `sections`, `aliases`, `files`, `lazy`,
  `preload`, `mini`), `store.js`, `list.js`, `friends.js`, `chat.js`, `lock.js` (→ UI-A); `send.js`, `sheets.js`,
  `flight.js`, `media.js`, `scan.js`, `settings.js` with every opener of spec §2.2 ❄ (→ UI-B); `service.js`
  (`startService` signature ❄, facade keys ❄, `PROTOCOL`), `core.js` (header ❄: the RPC table of §5.4 with argument
  rules, the `META` table written from `app.js`'s call sites, the §5.5 JSDoc typedefs, the topic list, the `why`
  words, `PROTOCOL`; body a stub answering `{ err: "no" }`), `idb.js` (exports ❄) (→ CORE); `chats.css`,
  `chsheets.css` empty scoped files (→ UI-A, UI-B).
- MAIN tests: `.tools/tests/roofhooks.mjs` ❄ (spec §10.2's Chats hooks, each with its owner in a comment; may only
  gain); `unit/fixtures/chats.mjs` ❄ (one of each §5.5 shape, a two-friend one-group world, a locked and a `key`
  variant); `unit/fixtures/roof.mjs` (+ `chatsSkip`); `unit/roofrouter.test.mjs` ❄ (spec §10.1 row);
  `unit/roofcontract.test.mjs` ❄ (parametrised by app; the page and Worker grep sets of S3-C2; no `service.js` import;
  `files`/`lazy`/`preload` rules; `PROTOCOL` ×3; BUILD/NEWS = `APP_VERSION`/`APP_NEWS`; device rule = `theme.js`'s);
  `.tools/tests/roofkit/chatcore-stub.js` (a module Worker answering every RPC from the fixtures, with a `?state=`
  switch for `ready|signin|key|locked|device|offline|ended`) and the kit page's `?service=stub` wiring (→ HOST).

**Must not touch:** anything else; no user-visible change (Today doesn't use `F.service` yet; `/chats/` is still
milestone 1's page).

**Steps:**
1. Router: `REGISTRY.chats`, `skip`, `raw`/`hash`. Check stage 2's/4's frozen spellings in `router.js` and `frame.js`; if
   they differ from spec §5.1 (`link`, `idb`, `stay`, `mods`), use theirs and note the mapping in your log.
2. The `core.js` header: RPC table (method, arguments with types and limits, result shape, patches it may emit),
   `META` (endpoint, method, allowed argument keys), typedefs, topics, `why` words. This is the document CORE, UI-A,
   UI-B and Q build to. Push it as your first commit so CORE can start reading.
3. Fixtures and the stub core; the kit page's `?service=stub` (the frame stubs resolve `fw.service()` to it).
4. Every module stub with its static imports as the real file will have them (so the graph is the agreed one), every
   dynamic import inside `fw.lazy(` (page) or the core's one `import("../rank.js")`, `STUB = true`.
5. Hooks; router and contract tests.

**Done when:** unit suite green (with your cases; also once with IFL's `router.js` moved aside so roof cases skip
cleanly); `node --check` every file; IFL dry run ok; e2e `roofkit todayshell` FAILS 0 (nothing visible changed; the kit
mounts the stub Chats module and opens one stub sheet per opener file).

---

## CORE · Worker core and service (wave 1; deep review)

**Goal.** The crypto core in a dedicated Worker and the service that fronts it: same keys and database as Chat, the
trust gate intact, the lock from the first call, a frozen facade for Today, nothing a server or the page shouldn't see.

**Read first:** spec S3-D3–D6, S3-D10, S3-D14, §3.2, §5.2 (S3-C2, S3-C3, S3-C5), §5.4–§5.6, §9 risks 1–3, 5, 6, 8;
`$S3/critique-risk.md` B2–B5, I1–I3, I8, I9, I15; `map-chat.md`; MAIN `pigeon/app.js` at every range S3-D5 names,
`pigeon/crypto.js`, `.tools/tests/unit/engine.test.mjs` (how it extracts a block of `app.js`).

**Owns:** MAIN `pigeon/roof/core.js` (body; the B0 header may only gain comments), `idb.js`, `service.js`;
`.tools/tests/unit/roofchatcore.test.mjs`, `roofchatservice.test.mjs` (new).

**Must not touch:** `pigeon/app.js` and every other `pigeon/*` file; the other `pigeon/roof/*` files; IFL.

**Steps:**
1. `idb.js`: `inflight`/`kv` get/set/del with `app.js`'s exact shapes; `locked(key, fn)` over `navigator.locks`;
   `gone` guard.
2. `core.js`: copy the S3-D5 verbatim list byte for byte (incl. `checkPin`, `trustNewKey`, `setVerified`, `isVerified`,
   `wasVerified`, `seenPlain`, `base`, `checkMyKey`); `start` with `engineStart`'s pins block line for line; `sync`
   keeping the `pinsWait` wait verbatim; port the rest as patches; locked by default; `cache:` only after
   `start({ screen: true })`; read-merge-write under locks; no object URLs; `../rank.js` imported on first `rank`/
   `sendRun`; every argument checked; the honest-limit paragraph in the header.
3. `service.js`: makes the one Worker (`new URL("./core.js", import.meta.url)`), handshake (`hello(PROTOCOL)`, mismatch
   → `onStale`), reads `inflight-lock` before the first call, queue during restart (5 s, then `why: "offline"`),
   re-create on `visible` if dead, `ui.on("push")` → quiet sync + `pushTag`, the store feed (`on`, `call`), the frozen
   facade (`Object.freeze`, seven keys, the tap check from `makeIFLChat`, the header note that it is best-effort in one
   realm), `share` through `ui.lazy(() => import("./send.js"))`, `release({ terminate })`.
4. Tests (spec §10.1 rows): parity (extract each function from `app.js` and from `core.js`, compare after
   whitespace normalising; the `pinsWait` slice); the core in node with a stub `fetch`/`crypto.subtle`/IDB/locks/
   `postMessage`: TOFU on a fresh unlock, locked at start, `quiet=1`, open/leave nulls, no `cache:` before screen,
   `forget` refuses writes, storage goldens both ways against `app.js`'s readers, outbox merge, RPC refusals and
   non-`META` names, no result key `d/kty/token/ct/iv`, no URL/header with a message word; the service: facade keys and
   freeze, no `call`, tap rule, stale, restart queue, lock read, push relay, real answers match `fixtures/chats.mjs`.
5. Measure and log: `core.js`+`idb.js` gz, core graph gz, `service.js` + core graph gz (budgets 36 / 55 / 58 KB).

**Done when:** both new tests and the unit suite green; `node --check`; the kit page with `?service=real` (HOST's or
B0's wiring) starts the real core with no UI change (a smoke you run with the kit open in `roofkit`'s harness, or
recorded as a `roofchatservice` case if the kit isn't merged yet); budgets met or raised with a reason in your log;
the deep reviewer signs off (the integrator assigns one: review against spec §5.4 and the parity list, not a
re-derivation).

---

## UI-A · Entry, list, Friends, chat (wave 1)

**Goal.** The Chats screen: entry, store, the list with In the Air, Friends, a chat or group with its composer and
scroller, the lock screen, every state of spec §2.1, and the connector; proven on the kit page against the stub core.

**Read first:** spec S3-D9, S3-D10, S3-D13, S3-D14, S3-D17, §2.1, §2.4 (no list search field), §3 (all), §5.2–§5.3,
§5.5; `map-chat.md`, `map-design.md` (tokens, Chats blue); MAIN `pigeon/app.js` `vMessages` 5345, `vFriends` 5426,
`vChat` 6695, `vGroupChat` 6648, messages 5665-5804, composer 6768-7033, keyed redraw 4914-5135, `onClick1` 9414-10384,
lock 10494-10536; `pigeon/styles.css` 283-917; `weather/roof/weather.js` (a module entry to copy the shape of).

**Owns:** MAIN `pigeon/roof/chats.js`, `connector.js`, `store.js`, `list.js`, `friends.js`, `chat.js`, `lock.js`,
`chats.css`; `.tools/tests/unit/roofchatviews.test.mjs` (new; uses `roofkit/fakedom.mjs`);
`.tools/tests/roofchatmount.mjs` (new).

**Must not touch:** `service.js`, `core.js`, `idb.js` (CORE); UI-B's files; `roofkit/**` (B0 → HOST); IFL.

**Steps:**
1. `chats.js`: `mount` gets the service only through `fw.service()`; store; two sections and the chat host; header specs
   (root: tab-screen style, acts New Chat and Chat Settings; chat: Back, `sections: false`, Info); states of §2.1 with
   their words and one action each; device rule copied from `theme.js`; `busy()`; `show/hide/back/unmount` per §3.4;
   15 s `call("sync")` only while shown and visible.
2. `store.js` with `null` deletes and `clear(prefix)`; views subscribe on show, unsubscribe on hide.
3. `list.js`, `friends.js` (with `openNewChat`, `openNewGroup`, `openRequests`, `openAddFriend`), `chat.js` (S3-D17
   scroller, `fw.fill`, `fw.tabs.away`, keyboard via `visualViewport` removed on hide, per-chat anchor memory, draft
   flush on `hidden`, 1 s ticker), `lock.js`; delegated click per view; `fw.toast(text)` only; lazy openers through
   `fw.lazy`.
4. `chats.css` under `.m-chats`, tokens only; `connector.js` `files` = the exact static graphs.
5. Tests: `roofchatviews` (spec §10.1); `roofchatmount` on the stub (list, chat, composer, scroll and keyboard checks,
   `.away`, every state via `?state=`, axe, 320/390/1280).
6. Measure and log page static JS gz (≤ 110 KB) and `chats.css` gz.

**Done when:** unit suite green (`roofcontract` included: greps clean, graph = `files`); `node --check`; e2e
`roofchatmount` FAILS 0 (local slot or a cloud session); budgets logged.

---

## UI-B · Sheets, Send, settings (wave 1)

**Goal.** Every lazy sheet of spec §2.2 behind its frozen opener, the Send sheet with its five not-ready states, Chat
Settings with Privacy & Security as a link to Chat's own page, and `chsheets.css`.

**Read first:** spec S3-D7, S3-D8 (keys work stays on Chat's page), §2.2, §2.6, §3.1, §3.3, §5.4 (`META`), §5.5, §7;
MAIN `pigeon/app.js` sheets 7152-8281, `openSendSheet` 11383-11425, `sendRows` 11426, flight views 1234-2738 and
8282-9287, media 10385-10641, scan 3430-3489, `vAccount` 5450-5504; `pigeon/styles.css` 918-1596, 2269-2564.

**Owns:** MAIN `pigeon/roof/send.js`, `sheets.js`, `flight.js`, `media.js`, `scan.js`, `settings.js`, `chsheets.css`;
`.tools/tests/unit/roofchatsheets.test.mjs` (new); `.tools/tests/roofchatsheetmount.mjs` (new, kit page).

**Must not touch:** UI-A's and CORE's files; `pigeon/*` outside `roof/`; IFL.

**Steps:**
1. Each opener draws into `fw.sheet.open({ sheet, app: "chats" })`, reads through `svc.call` (only methods in the
   RPC table; metadata through `meta(name, args)` with `META` names), returns the handle.
2. `send.js`: `openSend(ui, svc, { card, words, to })` → `{ ok, say } | { ok: false, why }`; card checked as
   `engineCard`; rows from `share`, rank from `rank`; progress from `send` patches; on sent, `ui.toast` with
   `stillHere`'s words; the five not-ready states of S3-D7.
3. `settings.js`: Chat Settings and its Location page; Privacy & Security = an `<a href="/chats/in/#account">` row;
   credits row.
4. `media.js`: `MediaRecorder` and photo pick in the page, `Blob` to `sendBlob`, object URLs made and revoked here.
5. `chsheets.css` under `.ifl-sheet[data-app=chats]`, tokens only.
6. Tests: `roofchatsheets` (each opener draws on fakedom from the fixtures, escapes, no inline styles; Send's states).
   `roofchatsheetmount` on the kit page with the stub core: every §2.2 sheet you own opens and closes by hook, axe, 390
   light/dark.

**Done when:** unit suite green; `node --check`; e2e `roofchatsheetmount` FAILS 0 (local slot or a cloud session); lazy
sizes logged (`sheets.js`+`settings.js`+`send.js`, `flight.js`
own).

---

## HOST · Framework and Today (wave 1; deep review of the frame, tabs and app diffs)

**Goal.** The framework's side of S3-C1–C7 and the host's: Chats as a tab screen, the service handles, the push relay,
the indigo tab bar, and Today using the facade instead of the engine, with every sign-out path letting go of the core.

**Read first:** spec S3-D6, S3-D8 (the hop), S3-D12, S3-D14, S3-D16, S3-D17, §2.1 (tab and Back rules a–e), §2.4,
§4 (all), §5.1–§5.3; `$S3/critique-risk.md` I3, I4, I10, I11; `$S3/critique-build.md` B4, I4–I6, I14, I15; IFL
`today/public/roof/*`, `today/public/app.js` (`heard/askHub/hubReady/applyHub` 853-918, `retireOld`, sign-in 945/1843,
`signOut` 1135-1143, `signedOutNow` 1166-1174, 1203, 1288, 1573, 1944), `day.js`, `you.js`; MAIN `.tools/inflite/menu.js`
483-626 (read only).

**Owns:** IFL `today/public/roof/frame.js`, `tabs.js`, `modules.js`, `connectors.js`, `header.js`, `roof.css`;
`today/public/app.js`, `you.js`, `day.js` (only `forgetHeard`). MAIN `.tools/tests/unit/roofui.test.mjs`,
`roofpage.test.mjs`; `.tools/tests/roofkit/**` (after B0); `.tools/tests/roofshell.mjs`, `todayshell.mjs`,
`todaypage.mjs`, `mocks/todaystub.mjs`.

**Must not touch:** `router.js` ❄; `sw.js`, `src/*`, `_headers` (SV); `.tools/inflite/menu.*`, `cards.js`; anything in
MAIN `pigeon/`.

**Steps:**
1. `frame.js`: tab-screen header for `R.tab` roots, Back "Back to Chats" and cold Back to `R.path`; tab transition kind;
   `F.service`/`F.releaseService`/`fw.service` over `modules.loadService` (one instance per app in frame state, waits on
   `opts.retired`); `opts.serviceState` on `state` patches; `{inflight:"sync"}` → `fw.on("push")`; stale reload needs
   `!F.busy()`; no window scroll save/restore for `stay` routes; `setRoof(false, "chats")` terminates the core.
2. `tabs.js`, `roof.css`: `TAB_SCREENS` + `chats` while on; badge; away; `--ifl-tab-on` = InFlite indigo scoped to the
   tab bar; toast above the composer.
3. `modules.js`: `IFL.built(R.id || app)`; `loadService`; `preload` from `connector.preload ?? files`; keep
   `files ∪ lazy`. `connectors.js`: `chatsProvider(F)` (frame's own, order by screen), `places()` Weather-only.
4. `app.js`: `chatsHere` decided at boot (bare `ifl-roof` = ask again); the `#signin…` hop as the first line of
   `start()`; **Sign In hrefs unchanged**; `IFL.hub.chat = () => F.service("chats")` synchronously before first render
   and in `applyHub`; idle make → `F.service`; release on off, degrade, `signedOutNow`, user change; `signOut` awaits
   the core before `forgetApps`; `retireOld()` covers `/chats/` and is `opts.retired`; `chatSettings` → `#settings`;
   lock → clear `.dw-said`/`.dt-said` + `forgetHeard()`. `you.js` Chat row words. `day.js` `forgetHeard` only.
5. Tests: `roofui` (budget ≤ 24 KB gz as stage 2 set, ≤ 25 KB with a recorded reason; tab-screen header; badge/away);
   `roofpage` (spec §10.1 row); `todaystub` `mods.chats`; `roofshell`/`todayshell` cases with the stub service (Chats
   tab in-page, no iframe, one Worker).

**Done when:** unit suite green; `node --check`; IFL dry run ok; e2e `roofshell todayshell` FAILS 0; `roofkit` FAILS 0
if you changed `roofkit/**`; `roof/*.js` budget recorded; the deep reviewer signs off on the `frame.js`, `tabs.js` and
`app.js` diffs.

---

## SV · Server, root worker, switch, MAIN serving (wave 1)

**Goal.** `/chats/` answers the framework when Chats is on and milestone 1's page when off; Chat's own page at
`/chats/in/` and `?engine=1` always; the retiring worker that routes before it reloads; the root worker's rules; the
CSP; the per-app switch; stamped imports for `/roof/` files; the `/pigeon/in/` block.

**Read first:** spec S3-D1, S3-D8, S3-D11, §6 (all), §7, §8; `s2/spec.md` §5.3, §5.4, §7 (the general forms you add
`chats` to); `$S3/critique-risk.md` B1, I11, I13; IFL `today/src/hub.js`, `roof.js`, `today/public/sw.js`, `_headers`;
MAIN `functions/_app.js` (`stampImports` 70-118), `functions/_middleware.js` 100-120, `pigeon/app.js` 2755, 2787-2846,
12432-12440, 12540, `.github/workflows/roof.yml`, `.github/hub/hub.sh`; `$TF/i0-wfsim.py`.

**Owns:** IFL `today/src/hub.js`, `today/src/roof.js`, `today/public/sw.js`, `today/public/_headers`. MAIN
`functions/_app.js`, `functions/_middleware.js`, `pigeon/app.js` (the `/pigeon/in/` block only), `.github/workflows/
roof.yml`, `.github/hub/hub.sh`, `.tools/tests/hubstack.mjs` (`roof-off-chats`), `hubserve.mjs`;
`.tools/tests/unit/roofserve`, `hubworker`, `hubheaders`, `todayfiles`, `rootsw`, `todaysw` `.test.mjs` (extend),
`roofchatserve.test.mjs` (new).

**Must not touch:** `today/public/app.js` and `roof/*` (HOST); `pigeon/roof/*`; `APP_VERSION`/`APP_NEWS` (I).

**Steps:**
1. `roof.js`/`hub.js`: `MODS` + `chats`, `modOf` with the `?engine` and `/chats/in/` exceptions, `mods.chats`,
   `ROOF_OFF_CHATS`, `RETIRE_SW("chats")` (cache `inflight-shell*`, route first, navigate only non-answering windows at
   exactly `/chats/` or `/chats/index.html`), 404 for `/chats/roof/*` when off; CSP + Permissions-Policy in
   `PAGE_HEADERS` and `_headers` (merged with stage 4's if present).
2. Root `sw.js`: `MODS` lists, `engine`/`in/` skips, chats keep list, `moduleFile` by pathname.
3. MAIN: `stampImports` for `/roof/` files (`../`, `new URL("./x.js", import.meta.url)`), standalone output
   byte-identical; `/_hub/in/` page and `/_hub/in/<file>` → `/_hub/<file>`; the `/pigeon/in/` block (no SW
   registration, no-`then` → `/chats/`, session + no sign-in → `/chats/` + hash).
4. Switch: `roof.yml` `app: chats`; `hub.sh` `wait_roof … chats`, verdict words; `hubstack.mjs` `roof-off-chats`.
5. Tests per spec §10.1 rows, each rewritten case keeping its earlier assertion under its skip.

**Done when:** unit suite green with IFL `roof3/sv` beside and with the stage-3 roof files absent (skips with reason);
`node --check`; `imports.test.mjs`; IFL dry run ok (prod and `--env next`); `bash -n .github/hub/hub.sh`; the
`i0-wfsim.py` dry runs for `app=chats` (settled → set; not settled → refused); e2e `hubserve chats` FAILS 0 (standalone
Chat unchanged).

---

## Q · Acceptance tests (wave 1 to write; run at I)

**Goal.** The hub-stack proof of the whole stage, written now against B0's hooks and fixtures, run first against the
merged branch.

**Read first:** spec §2 (all), §8, §9, §10.2; `$S3/critique-risk.md` I14; MAIN `.tools/tests/roofweather.mjs`,
`roofnav.mjs`, `hubshare.mjs`, `rooflib.mjs`, `roofhooks.mjs`, `todayauth.mjs`, `hubstack.mjs` (read).

**Owns:** MAIN `.tools/tests/roofchats.mjs`, `roofchatnav.mjs` (new); `roofnav.mjs`, `hubshare.mjs`, `rooflib.mjs`
(`chatPhone()`, `CHAT_LAZY`, a `workers()` counter, a hostpass sentence scanner), `todayauth.mjs` (first line only:
`// needs: hub roof-off-chats` variant as a second file `todayauthoff.mjs` if one file can't take both).

**Must not touch:** product code; other batches' tests; `roofhooks.mjs` (ask B0/the integrator).

**Steps:** write `roofchats` parts 1–13 and `roofchatnav` parts 1–4 exactly as spec §10.2; the `roofnav` and `hubshare`
changes; `todayauth` with Chats off. Each part names its spec decision in a comment. `node --check` every file. When
SV, CORE and HOST have merged, run them once against `claude/one-roof-s3` in a worktree updated from it, and hand each
failure to its owner.

**Done when:** files written and `node --check`ed; one run of `roofchats roofchatnav` against the merged branch with
every failure assigned (passing is I's gate, not yours).

---

## I · Integration (run by the integrator)

**Goal.** Merge every batch into `claude/one-roof-s3` as it goes green, make the shared changes, prove the whole stage,
and go live per spec §11.2.

**Owns:** `.tools/tests/suite.txt`, `.tools/tests/README.md`, IFL `README.md`, `min/**`, `APP_VERSION`/`APP_NEWS` in
`pigeon/app.js` and `BUILD`/`NEWS` in `pigeon/roof/chats.js`, Today's `BUILD`/`NEWS` in `today/public/app.js`, the final
trim of `connector.files`/`lazy`, `$S3/golive.md`, `$S3/integrate-todo.md`.

**Must not touch:** batch-owned code beyond those lines. A behaviour conflict goes back to its owner.

**Steps:**
1. Make `claude/one-roof-s3` in both repos from `claude/one-roof` (stage 1 live), merge stage 2's integration branch
   (and stage 4's if merged); unit suite; make `$INT` checkouts. Start B0.
2. Merge B0 (`git merge --no-ff roof3/b0` in both repos); unit suite; tell all six wave-1 batches to start. Assign the
   two deep reviewers (CORE; HOST's `frame.js`/`tabs.js`/`app.js` diffs) and up to two extra cloud sessions for kit
   tests.
3. Merge as each goes green: SV and CORE first, then HOST, UI-A, UI-B. After each merge, tell running batches they may
   merge `claude/one-roof-s3`. After UI-A and UI-B: `roofchatmount roofchatsheetmount`. Then ask Q for its first run.
4. Versions and generated files: Chat +0.01 (1.70 unless something moved it) with `APP_NEWS` (what's new and S3-D15's
   changed behaviour), `chats.js` `BUILD`/`NEWS` equal; Today +0.01 with NEWS; trim `connector.files`/`lazy` to the
   exact graphs; `node .tools/minify.mjs`, then `node .tools/wxshell.mjs`; `node .tools/iflmenu.mjs
   ../inflite/email/public ../inflite/today/public` and `node .tools/signin.mjs ../inflite/today/public` print no
   change; `ROOF_INTEGRATED=1` for the strict `min.test`; `suite.txt` adds `roofchatmount roofchatsheetmount roofchats roofchatnav`
   (and `todayauthoff` if Q made it); READMEs.
5. Checks: unit suite with IFL `claude/one-roof-s3` beside (0 fail, 0 skipped) and with IFL `claude/inflite` beside
   (0 fail, stage-3 cases skipped with reason); `node --check` every changed file; `imports.test.mjs`; MAIN functions
   build; IFL dry runs (prod, `--env next`, `email/`); `roofchats roofchatnav roofnav hubshare roofshell todayshell
   todayauth` plus standalone `chats instant security sec2 syncperf storage vanish pigeonway move` FAILS 0; the full e2e
   suite **once**, split in halves across two sessions (R3), every test FAILS 0 (a known flake re-run once); budgets of
   §5.6 recorded in `golive.md`.
6. Go live, spec §11.2 in order (MAIN to `main`; staging with the switch off and on at next.inflite.ai, including a
   sign-in with Chats off; IFL to `claude/inflite` and `…-dist7t`; settled check; no other IFL push for a day), each
   result in `golive.md`, rollback (§8) to hand: `roof.yml app=chats state=off`.

**Done when:** §11.2 steps 1–5 checked and recorded; phone checks listed for George.
