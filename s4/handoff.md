# One roof, stage 4 (Mail): briefs for each batch

One brief per batch. Follow it with `s4/spec.md` (beside this file; revision 2), `roof/addendum.md` (which wins over
both) and the code files it names. Section numbers (§), decisions (S4-Dn) and contract changes (Cn) are `s4/spec.md`'s;
"stage 1 §n" / "Dn" are `roof/spec.md`'s. Read "Every batch" first, then your own brief.

- MAIN = the `georgefarrowgreen` repo (Cloudflare Pages: Chat, Weather, Fitness, Markets, the account page, server code
  in `functions/`). IFL = the `inflite` repo (the Worker at `inflite.ai`: Today in `today/`, Mail in `email/`, Mail's
  Worker `inflite-email`).
- ROOF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof`; S4 = `$ROOF/s4` (this folder);
  TF = `/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf` (`e2e.sh`, `i0-wfsim.py`, results
  under `state-<name>/`).
- The integration branch is **`claude/one-roof-s4`**, made by the integrator from `claude/one-roof` once stage 1 is
  live, checked out at `/home/user/up4/roof4/int/georgefarrowgreen` and `/home/user/up4/roof4/int/inflite`. **Batches
  never edit those checkouts or `/home/user/up4/tf/*`**: only the integrator merges.
- Stage 2 (Markets and Fitness) is built at the same time on `claude/one-roof-2`. B0-a is shared with it (spec §5). Stage
  2's batches never touch `email/**`, `today/public/mail*.js`, `today/src/mail*.js` or Mail's tests; stage 4's batches
  never touch `markets/`, `fitness/`, `weather/` or a framework file after B0-a.

| id | Batch | Wave | Starts after |
|---|---|---|---|
| `b0a` | B0-a · Joint contracts (R0, stages 2–4) | 0 | – (alone or beside `b0b`) |
| `b0b` | B0-b · Mail's contracts | 0 | – (beside `b0a`) |
| `mw` | MW · Mail's Worker | 1 | `b0b` merged and `b0a`'s names commit merged |
| `mb` | MB · Body boundary and Mail's service worker | 1 | same |
| `mm` | MM · Module core | 1 | same |
| `mr` | MR · Reader and sheets | 1 | same |
| `mt` | MT · InFlite and account side | 1 | same |
| `mq` | MQ · Acceptance tests | 1 (writes now; runs after MW, MB, MM, MR, MT merge) | same |
| `i` | I · Integration | 2 | run by the integrator, merging each batch as it goes green |

**Why it's quick.** Every name a second batch needs is frozen in B0, which runs as two sessions at once (the shared
framework work and Mail's stubs touch no common file). The six wave batches then start together and never edit a
shared file. Module work is proven on the kit page against a mock of Mail's API, so no module batch waits for the
server or takes a hub e2e slot. Deep review (R3) is only for MB, MW's gate and B0-a's shared Today code. The slow e2e
are split so the integrator can run them in halves on the extra sessions.

---

## Every batch

### Set up

Every batch makes its own pair of worktrees side by side (MAIN's tests look for IFL at `../inflite`), on
`roof4/<id>` off `claude/one-roof-s4`:

```sh
B=mm                                   # your batch id, lower case: b0a b0b mw mb mm mr mt mq
W=/home/user/up4/roof4/wt/$B
ROOF=/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/roof
TF=/tmp/claude-0/-home-user/08ceabf0-4558-56d4-9e3e-4d128d8ff562/scratchpad/tf
mkdir -p $W
git -C /home/user/up4/roof4/int/georgefarrowgreen worktree add $W/georgefarrowgreen -b roof4/$B claude/one-roof-s4
git -C /home/user/up4/roof4/int/inflite          worktree add $W/inflite          -b roof4/$B claude/one-roof-s4
ln -s /home/user/up4/tf/georgefarrowgreen/.tools/tests/node_modules $W/georgefarrowgreen/.tools/tests/node_modules
ln -s /home/user/up4/tf/inflite/node_modules                        $W/inflite/node_modules
ln -s /home/user/up4/instant/inflite/email/node_modules             $W/inflite/email/node_modules
cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs   # baseline: note pass/fail/skipped
```

If the worktrees already exist (a fix round), `cd` into them and carry on. To pick up batches already merged:
`git -C $W/georgefarrowgreen merge claude/one-roof-s4` (and the same in `$W/inflite`). Do that before any test your
brief says needs another batch.

### Run things

- All unit tests (MAIN's and the IFL-reading ones, from MAIN): `cd $W/georgefarrowgreen && node --test .tools/tests/unit/*.test.mjs`
- One unit test: `node --test .tools/tests/unit/<name>.test.mjs`
- Module loading (if you touched anything a server imports): `node .tools/tests/unit/imports.test.mjs`
- Parse check: `node --check <file>` for every `.js`/`.mjs` you changed.
- IFL dry runs (any IFL change): root Worker `cd $W/inflite && npx wrangler deploy --dry-run --outdir $ROOF/s4/dry-$B`
  (B0-a also `--env next`); Mail's Worker `cd $W/inflite/email && npx wrangler deploy --dry-run --outdir
  $ROOF/s4/dry-$B-email`.
- Byte budgets without a browser: `roofmailcontract.test.mjs` measures gzip of the module's files (spec §4.5).
- **End-to-end tests, only through the isolated runner, only the tests your brief names:**
  `$TF/e2e.sh $W/georgefarrowgreen s4-<id> <test> [<test>…]` (use `s4-<id>-<n>` to keep an earlier run; each run wipes
  `$TF/state-<name>/`). Results: `$TF/state-<name>/results.log` ("FAILS 0" is a pass; a hub test that prints `SKIPPED`
  is **not** a pass). Logs `$TF/state-<name>/<test>.log`, screenshots `$TF/state-<name>/out/<test>/`. At most two runs
  machine-wide (the runner waits for a slot; stage 2 shares them); put all your tests in one call. Never the full suite
  (that's I's).
- e2e tests select DOM only through `.tools/tests/roofhooks.mjs` (spec §10.2). A hook you need that isn't there: report
  it, don't invent a selector into another batch's markup.

### Rules

1. **Edit only the files your brief says you own.** If you need a change in someone else's file, stop and report it in
   your hand-off (`needsFromOthers`); don't make it.
2. **The names other batches use are fixed** by B0: every export, store key, `ctx` member, opener, sheet name, hook,
   API method and payload shape in spec §4.2, §4.6, §4.7 and §5. Keep them; add, don't rename.
3. **Never** push; never bump a version (`BUILD`, `NEWS`, `APP_VERSION`, `APP_NEWS`, nor `mail.js`'s copies); never run
   `node .tools/minify.mjs`, `node .tools/wxshell.mjs`, `node .tools/iflmenu.mjs` or `node .tools/signin.mjs`; never
   edit `.tools/tests/suite.txt` or `.tools/inflite/menu.*`. Integration does all of that.
4. Every unit test green, in both IFL states: a MAIN unit case that needs Mail's module in the IFL beside skips with
   `mailSkip` (or `roofSkip`) from `unit/fixtures/roof.mjs` and says why; a case you rewrite keeps its earlier
   assertion for the other state.
5. **Privacy, always:** no message words (subject, sender, body, search, address typed) ever reach InFlite's Worker, the
   account's server, a request URL, a push, `today:*` storage or a log. Message bodies never render on inflite.ai
   (spec §3.1). Every string from data goes through `textContent` or `fw.ui` builders; no `innerHTML`,
   `insertAdjacentHTML`, inline styles or inline handlers (the page CSP refuses them).
6. **Mail at email.inflite.ai keeps working exactly as today** except the lines your brief names. Hub mode keys on the
   server's answer (`/api/hub` `apps.mail`, Mail's `HUB_API`), never on a hostname.
7. Words on screen: London, UK English, plain words, title case on buttons as the apps already do ("Open Mail on Its
   Own", "Try Again", "Mail Settings", "Send Without the Quoted Text?").
8. **No model names or model IDs** anywhere: not in commits, code, comments, logs or test names.
9. Commit on `roof4/<id>` in each repo you changed: small commits with plain messages, each ending with exactly these
   two lines:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   Claude-Session: https://claude.ai/code/session_014XnqoGQHbED3n4J5zbYg9i
   ```
10. Work fast (addendum R1): build what your brief and the spec ask, prove it with the checks named, nothing more.
11. Append a short log to `$ROOF/s4/<id>-log.md` (what you built, decisions, commands and their counts, what's left).
    When done, report: what you built, the test commands and results (unit pass/fail/skipped counts, each e2e
    `FAILS n`), the commits, anything not done and why, and anything you need from another batch.

### What "Done when" means

Every item proven by a command you ran in your own worktrees on your final commit, with the counts in your report.
"FAILS 0" for each e2e named; unit suite 0 failing (skips only with their stated reason); `node --check` clean; dry runs
ok where IFL changed.

---

## B0-a · Joint contracts (R0, stages 2–4)

**Goal.** Build spec §5 (C1–C15) once, for stages 2, 3 and 4, so no wave batch of either stage edits a framework file,
Today's hub code, the root Worker or the switch. Nothing user-visible changes with no new module switched on. Run beside
B0-b (no common file). **Before you start:** check whether stage 2's B0 has already landed any of these on
`claude/one-roof-2`. If it has and the names match §5, merge it and add only what's missing; if the names differ, stop
and ask the integrator, who picks one set for both stages.

**Read first:** spec §0, §5 (all), §6.4, §8, §10.1 (the shared rows), §10.2 (hooks); stage 2's `s2/spec.md` §3 and §5
(its REGISTRY entries, C1 `ARG`, C4 `lazy`, C5 `idb`); stage 1 §3.2–3.6, §3.12, §8; IFL `today/public/roof/router.js`,
`frame.js` (`roofOn` 76, `setRoof` 123–135, `nav.back` 176–182, `section` 184–200, `render`/`change` 250–300,
`appHead` 223–229, `places` 372–409), `modules.js`, `connectors.js`, `toast.js`, `today/public/app.js` (853–918
`heard/askHub/hubReady/applyHub`, 1041 `APP_KEPT`, 1067 `forgetApps`, 1127 `signOut`, 1166 `signedOutNow`),
`today/public/sw.js`, `_headers`, `today/src/roof.js`, `hub.js`; MAIN `.github/workflows/roof.yml`,
`.github/hub/hub.sh` (724 `worker_settled`, 752 `roof_set`, 778 `wait_roof`), `.tools/tests/hubstack.mjs`,
`roofkit/serve.mjs`, `roofhooks.mjs`, `rooflib.mjs`, `unit/fixtures/roof.mjs`.

**Owns:**
- IFL: `today/public/roof/router.js` ❄, `frame.js`, `modules.js`, `connectors.js`, `toast.js` (C1–C11, C14 only);
  `today/public/app.js` (only the hub/apps reading, `signOut`, `signedOutNow`, `APP_KEPT`, `APP_SESSION_KEPT`);
  `today/public/sw.js` (C12 and §6.4); `today/public/_headers` and `today/src/roof.js` (C1, C13); `today/src/hub.js`
  (`/api/hub` `apps`, per-app roof routing for stage 2's apps as its spec gives them).
- MAIN: `.github/workflows/roof.yml`, `.github/hub/hub.sh` (spec §8 level 1); `.tools/tests/hubstack.mjs`,
  `roofhooks.mjs` ❄ (may only gain), `rooflib.mjs` (per-app helpers), `roofkit/serve.mjs`, `roofkit/index.html`/`kit.js`
  (any REGISTRY app from disk, Mail's from IFL `email/public/roof/`, `apps` in the session, `http://email.kit.test` in
  the kit's CSP copy); `unit/fixtures/roof.mjs` ❄ (`mailSkip`); `unit/roofrouter`, `roofcontract`, `roofui`,
  `roofserve`, `todayfiles`, `rootsw`, `todaysw`, `hubworker`, `todaykept`, `roofpage` (C10 order only) `.test.mjs`.

**Must not touch:** `email/**`, `today/public/mail*.js`, `today/src/mail*.js`, `you.js`, `cards.js`, `apps.js`,
`index.html`, `header.js`/`sheet.js`/`ui.js`/`search.js`/`send.js`/`tabs.js`/`roof.css` (none of C1–C15 needs them),
anything in `weather/`, `markets/`, `fitness/`, `pigeon/`.

**Steps:**
1. **Names commit first (aim: within an hour), so the wave can start:** `router.js` REGISTRY gains `mail` exactly as C2
   (and stage 2's `markets`/`fitness` and wider `ARG`), `link`, `keep`, the `roof` map in `parse`/`owns`; `roof.js`
   `roofOn(env, app)` and `appsOn(env)` (C1's rule: absent = off for every app but Weather); `/api/hub` `apps`;
   `fw.nav.depth`, `fw.nav.go(path, { replace, kind })`, `fw.header.set({ sections: null, back: { label } })`,
   `toast()` → `{ close() }`, `F.flush()`/`instance.flush` (even if a first cut); `roofhooks.mjs` Mail hooks and sheet
   names (spec §10.2); `fixtures/roof.mjs` `mailSkip`; `hubstack.mjs` flags `roof-<app>` (`roof-mail` also sets
   Mail's `HUB_API_TEST: "1"`), the `email.ifl.test:8788` pass-through port with `MAIL_VIA` for IFL and the account,
   `MAIL_KEY: 'mail-test-key'` in Mail's and the account's vars; `rooflib.mjs` helpers; `roofui` cap 24 KB with the
   reason. Unit suite green; report the commit as **"B0-a names ready"**.
2. Behaviour: `F.session.apps` and `ifl-roof-apps` (C1); `F.setRoof(v, apps)` per app, waiting while busy or a sheet is
   open, `flush()` first; `loadModule` gate and the re-ask after a module's API refusal; C3, C6, C7 (keep-key focus and
   scroll after `show()` resolves), C8 (Places dropped only by Weather's provider); C10 in `signOut` (await `F.flush()`
   before `/api/logout`, the "Sign Out Anyway?" confirm on `lost > 0`) and `signedOutNow` (`forgetApps()`, session keys);
   `APP_KEPT` += `mail:replies mail:unsent mail:outbox mail:remote-images mail:lens`, `APP_SESSION_KEPT` =
   `["mail:signin-verifier"]`; C11 `lazy` in `keepOffline`; C14.
3. Root worker (C12, §6.4): one REGISTRY-shaped list for `KEEP_APPS`, `ROOF_DOCS`, `FRAMEWORK`, `APPS`, `NAME`, `BASES`,
   `HOSTS`; `/mail/` navigations as `/weather/`'s; the Mail notice step (show at once, tag check, fetch with 3 s cap,
   silent replace). `_headers` and `PAGE_HEADERS` CSP (C13), equal.
4. Switch (spec §8): `roof.yml` input `app` (`all` default = stage 1's `ROOF_OFF`; an app puts `ROOF_<APP>` `"1"|"0"`;
   `mail` puts `HUB_API`/`HUB_API_NEXT` on `inflite-email` first both ways); `hub.sh` `roof_set W NAME VALUE`,
   `worker_settled` accepting `inflite-email`, `wait_roof` reading `apps.<app>` plus Mail's preflight and `/body/`
   status, `roof_verdict` per app. Never `wrangler versions secret put`.
5. Tests: the shared rows of spec §10.1 (`roofrouter` Mail and stage 2 cases with Weather's unchanged; `roofcontract`
   iterating REGISTRY with `lazy`, `idb` and Mail's IFL paths; `roofui` C3–C9; `roofserve`/`todayfiles` CSP;
   `rootsw`/`todaysw` C12 and the notice step; `hubworker` `apps` and the opt-in default; `todaykept` Mail's keys and
   `signedOutNow`; `roofpage` sign-out order).

**Done when:** unit suite green with IFL `roof4/b0a` beside and with the roof files absent (roof cases skip, nothing
fails); `node --check` on every file; IFL dry run ok (prod and `--env next`); `bash -n .github/hub/hub.sh`; `i0-wfsim.py`
dry runs: `app=mail state=on` (Mail's Worker first, then root), `state=off` (Mail's first), `app=all` unchanged, a not
settled Worker refused with nothing changed; e2e `roofkit roofwxmount roofshell roofnav` FAILS 0 (nothing changed for
Weather and Today). Deep review of `frame.js`, `app.js` and `sw.js` diffs before merge (R3). The integrator merges it
into `claude/one-roof-s4` **and** `claude/one-roof-2`.

---

## B0-b · Mail's contracts

**Goal.** Every file and name the Mail batches share, as stubs with final exports, so MW, MB, MM, MR, MT and MQ start
together and never edit each other's files. Nothing user-visible changes. Run beside B0-a.

**Read first:** spec §1, §3 (all), §4 (all), §6.1, §10; `map-mail.md`; IFL `email/src/index.js` (`fetch` 19–30, `page`
92–111, `api` 121–166, `getMessage` 496–520, `saveDraft` 838–870), `email/wrangler.jsonc`, `email/public/_headers`,
`email/public/app.js` (`realApi` 1144–1245, `demoApi` 1246–1650, `htmlFrame` 5068–5195, `replyDraft` 5687–5740);
stage 1's `weather/roof/*` stubs as they were in its B0 (git history of `claude/one-roof`) for the stub style.

**Owns** (and hands on; ❄ = frozen for everyone after you):
- IFL `email/public/roof/`: stubs of every file in spec §4.1, each exporting `STUB = true` and its final exports and
  static imports: `mail.js` (`CONTRACT`, `BUILD`/`NEWS` literal copies of app.js's, `SECTIONS` ❄, `mount` returning an
  instance with every method), `connector.js` (final: words ❄, `files` = the 15 ❄, `lazy` ❄), `store.js` (keys ❄),
  `api.js` (every method of §4.7 by name ❄, returning the mock's shapes), `logic.js`, `actions.js`, `list.js`/`reader.js`
  (view signature ❄), `rows.js`, `menus.js`/`compose.js`/`mailsettings.js`/`viewer.js`/`signin.js` (openers ❄),
  `icons.js`, `outbox.js`, `bodyframe.js` (§3.2 signature and message constants ❄), and empty scoped `mail.css`,
  `reader.css`, `mailsheets.css` → MM, MR, MB as spec §4.1 says.
- IFL `email/public/body/index.html`, `body.js`, `body.css` (empty shells → MB); `email/src/body.js` (a stub
  `body(request, env)` answering 404 → MB); `email/src/hubgate.js` (stubs `hubOrigins(env) → []` and `hubOf(request, env) → null`, both frozen → MW).
- IFL `email/src/index.js`: **only** the route lines that send `/body`, `/body/*` to `body.js` and call `hubgate.js` from
  `fetch` (no behaviour change while the stubs answer as today). `email/wrangler.jsonc` `run_worker_first` += `/body`,
  `/body/*`, `/roof/*`; `email/public/_headers` `/body/*` with `frame-ancestors 'none'` and `/roof/*` no-cache.
- IFL `today/public/index.html`: only `dialog#sh-mailnotify` in stage 1 §3.8's frozen form (inert until I's `you.js`
  line), and `today/public/mailnotify.js` (stub `openMailNotify(F)` → MT).
- MAIN `.tools/tests/mocks/mailmock.mjs` (Mail's `demoApi` data and behaviour as a `context.route` handler for
  `http://email.kit.test/api/*`, answering §4.7's endpoints including `/meta`, `/api/drafts/<id>`, `send { draftId }`
  and the POST searches), `.tools/tests/unit/roofmailcontract.test.mjs` (→ MM).

**Must not touch:** anything B0-a owns; any behaviour in `email/src/*` beyond the route lines; `email/public/app.js`.

**Steps:**
1. Stubs as above, with contract comments quoting the spec section; every dynamic import inside `fw.lazy(`.
2. `mailmock.mjs` from `demoApi` (keep its data; add the new endpoints' shapes exactly as §4.7).
3. `roofmailcontract.test.mjs`: the rows of spec §10.1 that hold for stubs (exports, `files` = graph, `lazy`, greps,
   `BUILD`/`NEWS` equal to app.js's, connector words); the budget part runs only when no file exports `STUB`.

**Done when:** unit suite green (`roofmailcontract` passes on the stubs; with IFL's `email/public/roof/` moved aside it
skips with `mailSkip`'s reason); `node --check` on every file; Mail's dry run ok; e2e `hubmail` FAILS 0 (Mail unchanged).

---

## MW · Mail's Worker (wave 1)

**Goal.** Mail's server side of stage 4: the hub gate with its switches, the summary and draft endpoints, POST searches,
the notice, the Today card, server-side quoting and send-from-draft, `/roof/*`, and the one-line `of` in Mail on its own.

**Read first:** spec S4-D2, D4, D8, D9, D11, D17, D18, D24, §3.1, §3.5, §4.7 (payloads), §6.1, §8, §10.1 (MW rows); IFL
`email/src/index.js` (all of `fetch`, `api`, `route`, `getMessage`, `send` 640–815, `saveDraft`, `attachment` 600–632,
`appBuild` 353–364, `contacts` 634), `threads.js` (`rowToSummary` 256, `counts` 355, `listThreads`), `receive.js`
(222–233, `snippet`), `push.js` (`pushAll`), `auth.js` (`accessOf`), `email/public/app.js` `buildPayload` 6543–6697,
`fmtQuoteDate`, `replyDraft`.

**Owns:** IFL `email/src/hubgate.js`, `quote.js` (new), `connect.js` (new: card, notice, POST searches),
`email/src/index.js` (everything but B0-b's route lines and `/body/`), `threads.js`, `receive.js` and `push.js` (the
notice call sites, `noticeInflite`), `email/public/app.js` (only the `of` line in `replyDraft`); MAIN
`unit/mailgate.test.mjs`, `mailquote.test.mjs`, `mailconnect.test.mjs`.

**Must not touch:** `email/src/body.js`, `email/public/body/*`, `email/public/sw.js`, `email/public/roof/*`, the rest of
`email/public/app.js`, `wrangler.jsonc`, anything outside `email/`.

**Steps:** build spec §6.1's MW rows as written: `hubgate.js` (`hubOrigins(env)` filtered by `HUB_API`,
`HUB_API_NEXT`, `HUB_API_TEST`; preflight; headers on every hub answer; `Vary: Origin` on every attachment answer;
writes need `X-Inflite`; `Sec-Fetch-Site` only when sent; every §3.5 refusal; the two navigations only while a switch is
on); `/meta`; `/api/drafts/<id>` (drafts only, `quote.html` → `{ of, mode }` or `quoteOld`, files without bytes);
`latestId`; POST searches; `/api/notice` (`ok` or `reauth`); `/api/connector/card` (key before `accountView`); `quote.js`
and send-from-draft (`POST /api/send { draftId, key }`), `draftFiles` `{ ref }`; `noticeInflite` with `{ on, will, held }`
and `meta.inflite_on`; `/roof/*` and `/roof/version`.

**Tests:** spec §10.1's `mailgate`, `mailquote`, `mailconnect` rows; existing `mail*` units unchanged and green.

**Done when:** unit suite green; `node --check`; Mail's dry run ok; e2e `hubmail mailauth contactmail` FAILS 0 (switches
off: Mail and the framed page unchanged). Deep review of `hubgate.js` and the `index.js` gate diff before merge (R3).

---

## MB · Body boundary and Mail's service worker (wave 1)

**Goal.** The shell at `email.inflite.ai/body/`, its Worker route and headers, the parent half `bodyframe.js`, and Mail's
own service worker fixed so it never touches body frames. The security-critical part of the stage.

**Read first:** spec S4-D3, D17, §3 (all), §7, §10.1 (MB rows), §10.2 (`roofmailbody`); IFL `email/public/app.js`
`messageBody` 5031–5054, `cleanMail`/`htmlFrame`/`foldQuotes` 5057–5225, `email/public/sw.js` (23, 31–55, 94–105,
151–176), `email/src/index.js` `page()` 92–111, `email/public/app.css` (the `--mail-*` colours); `map-mail.md` §4.

**Owns:** IFL `email/public/body/index.html`, `body.js`, `body.css`; `email/src/body.js`; `email/public/roof/bodyframe.js`;
`email/public/sw.js`; MAIN `unit/mailbody.test.mjs` (new), `unit/mailsw.test.mjs`, `.tools/tests/roofmailbody.mjs` (new,
`// needs: hub mail roof-mail`).

**Must not touch:** `email/src/index.js` (B0-b's route line already calls you), `hubgate.js` (MW; your route asks it for
the switched-on origins through its exported `hubOrigins(env)`, frozen by B0-b), every other `email/public/roof/*`
file, `email/public/app.js`.

**Steps:**
1. `email/src/body.js`: spec §3.4 exactly (`/body/` with the Worker's headers and `Cache-Control: private,
   max-age=300`, `data-parents` and `?v=<BUILD>` written in, 404 with no origin switched on; immutable script and style;
   every other `/body` path 404).
2. `body/*`: spec §3.3 (strict hash, `data-parents`, posts only to `parent` with `targetOrigin = p`, accepts only
   `parent`'s messages from `p`, the HTML path and the text path moved from app.js verbatim but for colours, the shell's
   "Show quoted text", 401 words).
3. `bodyframe.js`: spec §3.2 (eager newest, lazy rest; one listener; validation; the 6 s rule after `load` or first
   sight while online; theme posts to `MAIL` only).
4. `sw.js`: spec §7 (navigations keyed only for `/` and `/index.html`; `SHELL` `mail-app-2`; `openMail` skips nested
   clients and opens a window).

**Tests:** `mailbody.test.mjs` and `mailsw.test.mjs` as spec §10.1; `roofmailbody.mjs` part A (frames built by the test
on the hub page exactly as §3.2, hostile mails, Mail's worker registered first, online and offline) and part B (through
the reader; it logs "part B skipped: reader is still a stub" until MM, MR and MT are merged).

**Done when:** unit suite green; `node --check`; Mail's dry run ok; e2e `roofmailbody hubmail` FAILS 0 (part A run, part
B skipped with its reason); deep review of all five files and the `sw.js` diff before merge (R3).

---

## MM · Module core (wave 1)

**Goal.** Mail's module entry, connector, store, API client, logic, actions, list, rows, menus, icons and outbox, on the
framework, with the list screens working on the kit page against the mock.

**Read first:** spec S4-D5–D9, D13–D16, D18, D20–D26, §2.1–2.4, §4 (all), §10.1 (MM rows), §10.2 (`roofmailmount`);
stage 1 §5 (module contract), §7.1 (Weather's `view` shape); `map-mail.md` R3, R6; IFL `email/public/app.js` ranges
named in spec §4.1 for your files; `today/public/roof/*` as B0-a left them; MAIN `weather/roof/weather.js` (a working
module to copy patterns from), `.tools/tests/roofwxmount.mjs` (a kit test to copy), `mocks/mailmock.mjs`.

**Owns:** IFL `email/public/roof/mail.js`, `connector.js`, `store.js`, `api.js`, `logic.js`, `actions.js`, `list.js`,
`rows.js`, `menus.js`, `icons.js`, `outbox.js`, `mail.css`; MAIN `unit/roofmaillogic.test.mjs`, `roofmailstore.test.mjs`,
`roofmailcontract.test.mjs` (from B0-b), `.tools/tests/roofmailmount.mjs` (new, kit).

**Must not touch:** `reader.js`, `bodyframe.js`, `compose.js`, `mailsettings.js`, `viewer.js`, `signin.js`, `reader.css`,
`mailsheets.css` (MR, MB), `email/public/app.js`, `email/src/*`, any framework or Today file.

**Steps:** build spec §4.1's MM rows. `mail.js`: header set first in `show()` and reset in `hide()`, one act, People's
badge with `say`, section/thread/settings/signin dispatch, S4-D6/D7 Back (with `fw.nav.depth()` and the `back.label`),
S4-D25 remembered lens, poll only while shown, provider (S4-D9), keys (S4-D23), `busy`, `flush`, `matchMedia` layout.
`api.js` exactly §4.7 (writes only with `X-Inflite`). `actions.js` through `batch`. `outbox.js` exactly S4-D18 and
S4-D16 (save then send, 6 s, toast handle, "Already sent", offline text-only queue, 256 KB, quota errors). `menus.js`
five sheets with spec §2.2's names; Mail Settings as the Views sheet's last row. `icons.js` by `createElementNS`.

**Tests:** spec §10.1's `roofmaillogic`, `roofmailstore`, `roofmailcontract` rows; `roofmailmount.mjs` (kit page
`?module=/mail/roof/mail.js`, the mock by `context.route`): lenses, filters, Views sheet, rows, swipes (not from the left
20 px), Later sheet, undo, outbox, search provider and "Search Mail for…" as a POST, static bytes. Reader parts stay
MR's (`roofmailmount2`).

**Done when:** unit suite green; `node --check`; budgets: static JS ≤ 55 KB, the three CSS files ≤ 12 KB (measured by
`roofmailcontract` once no file is a stub; until MR lands, report your files' share); e2e `roofmailmount` FAILS 0.

---

## MR · Reader and sheets (wave 1)

**Goal.** The reader (phone and iPad), compose, Mail Settings, the pictures viewer and the sign-in hand-back, with their
styles, on the kit page against the mock.

**Read first:** spec S4-D4, D6, D11, D12, D17, D18, §2.1–2.2, §3.1–3.2 (what the reader may and may not fetch), §4.1,
§4.2 (openers), §4.7, §10.1 (MR row), §10.2 (`roofmailmount2`); IFL `email/public/app.js` reader 4631–4960, 5234,
compose 5889–6542, settings 2288–2772, viewer 5287–5680, sign-in 6796–6852; stage 1 §3.8 (sheets).

**Owns:** IFL `email/public/roof/reader.js`, `compose.js`, `mailsettings.js`, `viewer.js`, `signin.js`, `reader.css`,
`mailsheets.css`; MAIN `unit/roofmailviews.test.mjs` (new), `.tools/tests/roofmailmount2.mjs` (new, kit).

**Must not touch:** MM's and MB's files (use `bodyFrame` through B0-b's frozen signature; it is a stub until MB merges),
`email/public/app.js`, `email/src/*`, any framework or Today file.

**Steps:** `reader.js`: cards from `api.meta`, never `/api/messages/<id>`; the newest frame on the tap from
`latestId`; files (S4-D17: `api.picture` for raster only, `fileUrl` for the rest); quick reply; foot; iPad toolbar and
the sticky pane (spec §2.1). `compose.js`: `openCompose(ctx, init)`, `quote: { of, mode }` with the snippet under
"Quoted below", drafts by `api.draft` with the `quoteOld` path, files by upload or `{ ref }`, close rules (S4-D18:
`onClose` writes `mail:unsent` synchronously, then a server draft, "Draft saved"; Delete Draft in ⋯), Send through MM's
`outbox`. `mailsettings.js`: S4-D11 (no New/Delete Address or Send From: the row opens `MAIL + "/#settings"` in a new
tab). `viewer.js`: pictures only. `signin.js`: S4-D12 with the encoded `back=`.

**Tests:** `roofmailviews.test.mjs` as spec §10.1; `roofmailmount2.mjs`: reader on a phone and at 1024, compose send
with undo, close saves, `quoteOld`, Mail Settings pages, viewer, sign-in states.

**Done when:** unit suite green; `node --check`; lazy budgets (compose ≤ 12, mailsettings ≤ 10, viewer ≤ 8, signin ≤ 2
KB) by `roofmailcontract`; e2e `roofmailmount2` FAILS 0.

---

## MT · InFlite and account side (wave 1)

**Goal.** Everything outside `email/` that Mail's module needs: the root Worker's `/mail/` roof branch and pass-through,
the framed page's notification fix, the Today card and Apps line, the account's notice route and preference, and You's
Mail Notifications sheet logic.

**Read first:** spec S4-D8, D10, D11, D20, D21, §2.3, §2.5, §2.6, §6.2, §6.3, §6.5, §10.1 (MT rows); IFL
`today/src/mailhost.js` (114–118), `today/public/mailhost.js` (40, 74, 86), `today/src/roof.js` (`roofPage`),
`today/public/cards.js` (a drawer to copy), `you.js` (the Weather Notifications sheet to copy); MAIN
`functions/_mailapp.js`, `_todaynotify.js`, `_todayday.js` (472–500), `_today.js` (18, 85, 133, 175), `_notify.js`
(149–151, 411), `_busy.js`, `_sites.js` (31).

**Owns:** IFL `today/src/mailroof.js` (new), `today/src/mailhost.js` (the one call), `today/public/mailhost.js`,
`today/public/mailcard.js` (new), `today/public/mailnotify.js` (from B0-b's stub), `today/public/apps/mail.svg` (new);
MAIN `functions/_mailapp.js`, `_todaymail.js` (new), `_todaynotify.js` (mail part), `_todayday.js` (mail lines),
`_today.js` (`CARDS`, new `LINES`); `unit/mailnotice.test.mjs` (new), `roofmailserve.test.mjs` (new),
`mailhost.test.mjs`, Mail's part of `todaydaypage.test.mjs`.

**Must not touch:** `you.js`, `cards.js`, `apps.js`, `index.html`, `app.js`, `sw.js` (B0-a and I), `email/**`, any other
`functions/` file.

**Steps:** spec §6.2 (`mailRoof` with `MAIL_VIA`/service binding preference, type checks, 404 `no-store` when off),
§2.3's framed-page rules in `today/public/mailhost.js` (`#thread`, `#settings`, same-path `{ifl:"open"}` → `frame.src`),
§6.3 (notice route answering `{ on, will, held }` first and pushing in `waitUntil`; `fromMail` for hand-back; the
preference; `_todaymail.js` with any non-200 → null; `cards.mail`, `appsOf` line, `CARDS`/`LINES`), §2.5's card drawer in
`mailcard.js`, `mailnotify.js` (`openMailNotify(F)`: Through InFlite via Today's `/api/notify`; per-address switches by
CORS to Mail's `/api/notify` (GET plain, PATCH with `X-Inflite`); the switch-off wording), `mail.svg` in the apps' icon
style.

**Tests:** spec §10.1's `mailnotice`, `roofmailserve`, `mailhost` rows and Mail's `todaydaypage` cases.

**Done when:** unit suite green; `node --check`; IFL dry run ok; e2e `hubmail todaypage todayshell` FAILS 0 (switch off:
framed Mail unchanged; Today's page with or without the card).

---

## MQ · Acceptance tests (wave 1; run after merges)

**Goal.** The three hub-stack acceptance tests that prove stage 4 end to end, written now against the spec and the
frozen hooks, then run once MW, MB, MM, MR and MT are merged.

**Read first:** the whole spec, especially §2, §6.4, §8, §10.2; MAIN `.tools/tests/lib.mjs`, `hubstack.mjs` (B0-a's
flags), `run.sh`, `hubmail.mjs` (seeding mail through `/cdn-cgi/handler/email`), `hubpush.mjs` (the push stand-in),
`roofweather.mjs`/`roofnav.mjs` (stage 1's acceptance tests to copy), `rooflib.mjs`, `roofhooks.mjs`.

**Owns:** MAIN `.tools/tests/roofmail.mjs`, `roofmail2.mjs`, `roofmailnav.mjs` (each first line `// needs: hub mail
roof-mail`).

**Must not touch:** `lib.mjs`, `run.sh`, `hubstack.mjs`, `rooflib.mjs`, `roofhooks.mjs` (B0-a; ask for a hook or helper),
any test another batch owns, any app code.

**Steps:** spec §10.2's three rows, part by part, each log line naming the spec section it proves; selectors only from
`roofhooks.mjs`; privacy checks by recording every request URL, push payload and storage key.

**Done when:** each file passes `node --check`; then, once MW, MB, MM, MR and MT are merged into `claude/one-roof-s4` and
your branch: e2e `roofmail roofmail2 roofmailnav` FAILS 0 (two runs: `roofmail roofmail2`, then `roofmailnav`). A
failure that is another batch's bug: report it with the step and log; don't change the test to fit.

---

## I · Integration (run by the integrator)

**Goal.** Merge every batch into `claude/one-roof-s4` as it goes green, make the one-line shared edits after stage 2's
batches, prove the whole thing and go live as spec §13 says.

**Owns:** IFL `today/public/you.js`, `cards.js`, `apps.js`, `sw.js` `FILES` (one line each, spec §6.5); every
`BUILD`/`NEWS` (Mail 1.49 in `email/public/app.js` **and** `email/public/roof/mail.js`, one commit; Today's next number);
`.tools/tests/suite.txt`, `.tools/tests/README.md`, IFL `README.md`; MAIN `unit/roofpage.test.mjs` (the
`sh-mailnotify` case); `$ROOF/s4/golive.md`.

**Must not touch:** batch-owned code beyond those lines. A behaviour conflict goes back to its owner.

**Steps:**
1. Make `claude/one-roof-s4` from `claude/one-roof` (stage 1 live) and the two checkouts at `/home/user/up4/roof4/int/`.
   Start B0-a and B0-b at once.
2. Merge B0-b, then B0-a's names commit (`git merge --no-ff roof4/<id>` in both repos); unit suite; tell the wave to
   start. Merge B0-a's final commit when green, into `claude/one-roof-s4` and `claude/one-roof-2`; tell running batches
   they may merge.
3. Merge the wave as each goes green: MW, MB, MT, MM, MR (any order; MB and MW after their deep reviews). Then MQ runs
   its tests; run `roofmailbody` part B yourself. Back to the owner on failure.
4. After stage 2's batches have merged on their branch (or if stage 2 goes live first, after rebasing on it): I's
   one-liners (`you.js` Mail row → `openMailNotify` and the Settings search entry; `cards.js` `CARD_KEYS`, `APP.mail`,
   the drawer import, admin-only in Edit Today; `apps.js` Mail's chips; `sw.js` `FILES` += `apps/mail.svg`), the
   `roofpage` case.
5. Versions: Mail 1.49 + `NEWS` (spec §6.1) in `email/public/app.js` and `mail.js`; Today's next number + `NEWS` ("Mail
   opens inside InFlite now"); `suite.txt` adds `roofmailmount roofmailmount2 roofmailbody roofmail roofmail2
   roofmailnav` after `roofsw`; READMEs. `node .tools/iflmenu.mjs ../inflite/email/public ../inflite/today/public` and
   `node .tools/signin.mjs ../inflite/today/public` print no change (stage 4 changes no copy). No `minify.mjs` or
   `wxshell.mjs` (no MAIN app file changes).
6. Checks: unit suite with IFL `claude/one-roof-s4` beside (0 fail, 0 skipped) and with IFL `claude/inflite` beside (0
   fail; Mail's cases skipped with their reason) in `/home/user/up4/roof4/wt/i-live/{georgefarrowgreen,inflite}`;
   `node --check` every changed file; `imports.test.mjs`; IFL dry runs (prod, `--env next`, `email/`); `i0-wfsim.py`
   for `roof.yml app=mail`; full e2e suite twice through `e2e.sh`, each pass split in halves across the extra cloud
   sessions (R3), every test FAILS 0.
7. Go live, spec §13 in order (secrets; MAIN to `main`; IFL to `claude/inflite` and `…-dist7t` with every step-2 check;
   staging on then off; `roof.yml app=mail state=on where=inflite.ai`; Through InFlite left to George; no other IFL push
   for a day), writing each check's result into `golive.md`, with spec §8's rollback to hand.

**Done when:** spec §13 steps 0–4 checked and recorded; the phone checks listed for George.
