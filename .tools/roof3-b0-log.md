# One roof, stage 3 · B0 (contracts): log

Branch `r3/b0` in both repos (from `claude/one-roof-24`). Brief: `s3/handoff.md` "B0 · Contracts" on `claude/roof-docs`.

## Name mapping: stage 3's spec → `s24-contracts.md` (the joint names win)

| `s3/spec.md` says | Built / to use | Where |
|---|---|---|
| `mods`, `F.session.mods`, `mods.chats` | `apps`, `F.session.apps`, `apps.chats` | frame, app.js, `/api/hub` |
| `ifl-mods` (sessionStorage) | `ifl-roof-apps` | app.js `APPS_KEY` |
| `ROOF_OFF_CHATS = "1"` turns Chats **off** (opt-out) | `ROOF_CHATS = "1"` turns Chats **on** (opt-in; absent, `"0"` or anything else = off); `ROOF_OFF = "1"` still turns everything off | SV: `roof.js` `roofOn(env, "chats")`, `MODS` += `"chats"` |
| `F.setRoof(on, app)` | `F.setRoof(roof, apps)` (roof = Weather's flag, apps the map) | frame (j0's) |
| `hubstack.mjs roof-off-chats` | `roof-chats` → `ROOF_CHATS: "1"` (Chats is off unless a test asks for it) | SV, Q |
| `todayauth` "with `roof-off-chats`" (Chats off) | plain `// needs: hub` (Chats is off by default) | Q |
| `hub.sh wait_roof SITE want [secs] chats`, reads `.mods.chats` | `wait_roof SITE chats true\|false [secs]`, reads `.apps.chats`; `roof_secret chats on\|off` → `ROOF_CHATS 1\|0` (put only) | SV |
| `roof.yml` app `chats`, `state=off` → `ROOF_OFF_CHATS=1` | `state=off` puts `ROOF_CHATS=0`, `on` puts `ROOF_CHATS=1`; `on` refused while `ROOF_OFF` is set | SV |
| `header.set({ sections: false })` (S4 C3), `fw.nav.go(path, { replace })` (S4 C4) | same (s24 §4) | – |
| `REGISTRY` `link`, `idb`, `stay` (S2 C2, S4 C2) | same (s24 §3) | router |
| `connector.lazy` (S2 C4) | same; `files ∪ lazy` ≤ 60 (s24 §8) | connector |
| `roof/*.js` budget: "stage 3's share ≤ 2.5 KB, else 25 KB" | s24 §13: 24 KB cap, **stage 3 ≤ 1,300 B** (see sizes below) | HOST |

## What B0 froze (❄) and where

**IFL** (`r3/b0`)
- `today/public/roof/router.js` ❄: `REGISTRY.chats` exactly spec §5.1 (`app, id: "chat", name, path, tab: "chats", link: "chat",
  idb: "inflight", entry, connector, service, css ×3, sections, aliases, stay: ["open"], raw: ["share"], skip: { paths:
  ["/chats/in/"], query: ["engine"] }`), all frozen. New optional fields `tab id raw service skip` (S3-C1).
  - `route.hash`: present **only** for a raw key (Chats' `share`): the whole hash after `#`, as written, ≤ 7000 characters
    (such an address may be 2048 + 7000 long; any other long address is still refused). `format` never writes it back
    (`/chats/#share`), so the tidy takes the words out of the address.
  - `skip`: a path under `/chats/in/` and any `/chats/` address whose query has a parameter named `engine` → `null` (a
    normal navigation), roof on or off.
  - Chats' routes are ours only with `roof === true` or `roof.chats === true` (s24's map rule); with today's servers
    (`apps` has no `chats`) nothing changes.
- Inert stubs (HOST fills): `F.service(app) → Promise<Facade>` (refused while the app is off or has no `service`; one
  promise per app in frame state, awaiting `opts.retired`, then `modules.loadService`), `F.releaseService(app, { terminate })`,
  `fw.service() → Promise<Service>`, `fw.tabs.away(on)` / `fw.tabs.badge(n)` (→ `F.tabs.away/badge`, no-ops in `tabs.js`),
  `opts.retired`, `opts.serviceState(app, state)` (called with the first state and on every `state` patch), `F.destroy()`
  releases services with `terminate`. `fw.on("push", fn)` already works as a subscription (fw.on → F.on); **the relay of
  the root SW's `{inflight:"sync", tag}` as `{ app: "chats", tag }` is HOST's** (not emitted yet).
  `modules.js loadService(app, F)`: `import(R.service)` → `startService({ path: R.path, ui: F.forModule(app), onStale: () => F.stale = true })`.

**MAIN** (`r3/b0`)
- `pigeon/roof/core.js` header ❄: the honest limit; what never crosses; the wire (`{ id, m, a: [positional args] }` →
  `{ id, ok, v }` / `{ id, ok: false, why }` / `{ t: "patch", topic, data }`); ARGUMENT RULES; STATES; WHY; the RPC table
  (method, args, result, patches) **also as data**: `export const RPC`, `META`, `TOPICS`, `WHY`, `STATES`, `PROTOCOL = 1`;
  the §5.5 typedefs. Body: B0's stub (answers `hello`, refuses the rest with `why: "no"`), CORE's.
- `pigeon/roof/service.js` ❄ header: `startService({ path, ui, onStale }) → Promise<Service>` (resolved once the core
  answered `start`); `Service = { protocol, state, call(m, ...args), on(topic | prefix | "*", fn), facade, release({ terminate }) }`;
  the facade = `makeIFLChat`'s seven keys, frozen; the lock read before `start({ visible, locked, screen, lockUid })`.
  The stub body works against the kit's stub core (Worker, hello, start, call, on, facade, tap check). CORE's.
- `pigeon/roof/idb.js` ❄ exports: `NAME, STORE, get, set, del, locked(key, fn), gone(), isGone()`. Stub, CORE's.
- `chats.js` ❄ (`CONTRACT, BUILD = "1.69", NEWS = APP_NEWS, PROTOCOL, SECTIONS, mount, deviceOf`, `STUB`), `connector.js` ❄
  (final words, sections, aliases, `files`, `lazy`, `preload`, `mini`), `store.js` (`createStore`), `list.js` (`view`,
  `openNewChat`, `openNewGroup`), `friends.js` (`view`, `openRequests`, `openAddFriend`), `chat.js` (`view`), `lock.js`
  (`view`) → UI-A. `send.js` (`openSend(ui, svc, { card, words, to })`), `sheets.js` (11 openers), `flight.js` (13),
  `media.js` (`openGifs`, `recordVoice`, `pickPhoto`), `scan.js` (`openScan`), `settings.js` (`openChatSettings`) → UI-B.
  `chats.css`, `chsheets.css` empty. Every stub has the static imports the real file will have; every lazy file only
  through `fw.lazy((q) => import("./x.js" + q))` in `chats.js` (send, sheets, flight, media, scan, settings).
- Tests: `roofhooks.mjs` ❄ (stage 3 block: `M_CHATS`, `CH_SEC/chSec`, `CH_ROW/chRow`, `CH_BUBBLE/chBubble`,
  `CH_COMPOSER`, `CH_INPUT`, `CH_SEND_BTN`, `CH_SCROLLER`, `CH_STATE/chState`, `CH_UNLOCK`, `CH_LOCK`, `TAB_BADGE`,
  `TABS_AWAY`, `HD_NEWCHAT/HD_CHATSETTINGS/HD_INFO`, `CH_SHEETS`/`chSheet(k)` (every §2.2 `data-sheet`), Send's and
  settings' hooks; owner per line). `unit/fixtures/chats.mjs` ❄ (`WORLD`, `ONE`, `STATES`, `VARIANTS`, `world(state)`,
  `shapeOf`, `IDS`, `NOW`; pure ESM, also served to the kit's Worker). `unit/fixtures/roof.mjs` (+ `chatsSkip`,
  `chatsStub(file)`, `CHATS_ROOF`, `MODULE_HOME.chats` = MAIN `pigeon/`). `unit/fixtures/budget.mjs` (+ `NET.chats`).
  `unit/roofrouter.test.mjs` ❄ (+4 stage-3 cases), `unit/roofcontract.test.mjs` ❄ (+9 Chats cases). Kit:
  `roofkit/chatcore-stub.js`, `roofkit/serve.mjs` and `kit.js` (`?apps=weather,chats`, `?service=stub|real`, `?state=…`),
  `roofkit.mjs` part 12.

## Decisions other batches must know
1. **`connector.files` includes `service.js`**: files = static graph of `chats.js` + `service.js` + `core.js` + the 3 CSS
   (§5.3 named only chats.js's and the core's graphs; without `service.js` Chats can't start offline, §7). 18 files.
2. **`connector.lazy` = send, sheets, settings, media + `/chats/rank.js`** (the core's one dynamic import: Send's ranking
   works offline). `NET.chats` = `flight.js`, `scan.js`, the geodata, `jsqr.js`, and **`argon2.js`/`argon2w.js`**
   (crypto.js's own Argon2, reached through its dynamic import; never kept, never under the roof, S3-D8).
3. **META gains `avatar` and `gif`** (raw images, `blob: true`: the page can't fetch them without the token). Rows'
   `avatar` is a key (`"<id>:<avatarAt>"`) or null; the page asks `meta("avatar", …)` for the Blob. META's argument keys
   are written from `app.js`'s call sites (line numbers in comments); `me` PATCH never takes `appearance` (S3-Q3).
4. **`start` gains `lockUid`** (inflight-lock's `uid`): the kept lock holds only for that account, as `lockPrefs` does.
5. **`a` is positional** (`svc.call("search", q)` posts `{ m: "search", a: [q] }`); `hello` is always answered with the
   core's own protocol, and the service decides (mismatch → `onStale`, no other call).
6. **`svc.on("*", fn)` replays** the last value of every topic but `chat:*`/`typing:*`, so `chats.js`'s store catches up
   with a service Today started earlier.
7. `F.service` is refused while the app is off; the facade resolves after `start` answered, so its `state` is known.
8. `ctx` as UI-A builds it: `{ fw, svc, store, open, lazy }` (`lazy`: the six lazy loaders; added beside the frozen four).
9. `service.js` calls `ui.lazy((q) => import("./send.js" + q))`; roofcontract reads `ui.lazy(` as `fw.lazy(` in
   `service.js` only.

## Changes outside B0's own files (mechanical consequences of `REGISTRY.chats`; owners please keep them)
- `unit/todaysw.test.mjs` (SV's): `MODPATH` gains `chats` (Today's scripts now name `/chats/roof/*` in `router.js`; those
  are the hub's module files, kept in `roof-chats-*`, not Today's `FILES`).
- `roofkit.mjs` (2 lines) and `roofshell.mjs` (HOST's, `APPS_ON`): `F.session.apps` and the kept `ifl-roof-apps` now
  name `chats: false` (`appsFrom`/`appsOf` walk REGISTRY). roofshell wasn't run (not in B0's brief): **HOST please run it**.

## Sizes
- `roof/*.js` gzip (comments stripped, roofui's measure): 22,496 B before B0 → **23,215 B** after (router +383 B, frame/
  modules/tabs stubs +336 B): B0 spent ~719 B of stage 3's 1,300 B; **HOST has ~581 B** (+ the ~75 B slack) under 24 KB.
  The spec allows HOST to raise it to 25 KB with a recorded reason; that will likely be needed.

## Tests (counts filled at the end)
