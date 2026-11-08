# Chat's tests

**Unit tests** (`unit/`, Node's own test runner, no dependencies): the space maths and lunar
eclipses (against real eclipses, to the minute), pigeons following someone between worlds, and
public-key checks. They run on every push (`.github/workflows/tests.yml`), along with a check that
every file parses.

    node --test .tools/tests/unit/*.test.mjs

Some read the inflite repo (InFlite's hub, `today/src/hub.js`; Today's Worker and page; Mail), which they look for
beside this one (`../inflite`), and skip where it isn't there. Run them with it beside, on the branch of the same name
(and Mail's one package installed: `npm ci --prefix ../inflite/email --omit=dev`): 0 failed and 0 skipped is a pass.
On each push, `tests.yml` checks this repo out with the inflite repo cloned beside it, at the branch of the same name
where it has one, else its live branch `claude/inflite`. This repo goes live first, so a test whose inflite file
isn't on that branch yet skips, never fails (Today First's, where it has no `today/src/hub.js`).

**End-to-end tests** (everything else here): real browsers (Playwright) drive the app against a
fresh local copy of the site for each test (`wrangler dev -c wrangler.worker.jsonc` on :8788, an empty database),
with stand-ins for Web Push, email, GIPHY, the weather and Have I Been Pwned (`mocks/`). People
make accounts and sign in (from the app, on the account's page, and back, as everyone does now: `join.mjs`; a test
that drives Chat's API directly signs in the same way, `handback.mjs`), add friends, send pigeons, and the tests
check what lands, what's drawn and what's pushed.

Admin avatar sizing has a standalone browser regression: `node --test .tools/tests/admin-avatars.test.cjs`
from the repository root. It renders the real Admin module and source/minified Account styles with synthetic
portrait, landscape and initials accounts at mobile and desktop widths; no server or account credentials are needed.
Set `CHROMIUM` to a local browser if needed, and `AVATAR_SCREENSHOTS` to save the rendered lists.

    cd .tools/tests && npm ci
    npx playwright install chromium          # or point CHROMIUM at a Chromium you have
    echo "127.0.0.1 chat.localhost" | sudo tee -a /etc/hosts
    ./run.sh                                 # every test in suite.txt (about 1½ hours)
    ./run.sh followtest lowsev               # just these

**InFlite in one window** (Today First): a test whose first line is `// needs: hub` runs with the hub beside the site
(`hubstack.mjs`): the inflite repo's Worker in `wrangler dev` on :8787 as `ifl.test:8788`, with `HUB_KEY=hub-test-key`
and `TEST_AT=1`, and a pass-through for each app's host (`mocks/hostpass.mjs`: :8791 account., :8792 chat., :8802
weather., :8803 fitness., :8804 finance., each request noted in `$S/hostpass.jsonl`); `// needs: hub mail` adds Mail's
Worker on :8806. `server.sh` gives the site `HUB_KEY=hub-test-key`, `HUB_ORIGINS=http://ifl.test:8788`, `HUB_PUSH=1`
and `TODAY_TEST_AT=1`. Without the inflite repo beside, such a test isn't run: its line in `results.log` says
`SKIPPED (no inflite repo beside)`, which is not a pass, and the run's last line counts them. `lib.mjs`'s `hubPhone()`
opens an iPhone at the hub (standalone, its push stand-in and keys); one window is asserted (`ctx.on('page')` stays at
1). The hub's tests: `hubserve` (the apps through the hub, signed in by the cookie), `wxhub`, `mkthub`, `ridetime`
(Fitness's Ride At), `hubmail` (Mail framed at `/mail/`), `chats`, `hubshare` (sending from Today and the apps, and
nothing readable left on the server), `hubpush` (one device, every app's notifications) and `todaymoments` (the six
moments of the day on real data, every request body and push recorded).

One roof (stage 1: one page at inflite.ai, Weather a module inside it): `roofkit` (the framework on its own kit page,
`roofkit/`, with a stand-in module and connector, or a real one with `?module=`), `roofwxmount` (Weather's real module
on the kit page), `roofshell` (Today, Apps and You on the framework, the hub's three answers and the `/weather/` boot
rules) and, through the hub, `roofweather` (Weather opened from the tile and the card, deep links, places, Send,
settings, the module's files and budget, updates), `roofnav` (Back, the tab bars, notification taps, the roof switch)
and `roofsw` (the old `/weather/` worker retired, offline). Their kit is `rooflib.mjs`, their selectors `roofhooks.mjs`.
With the inflite repo beside at a version without the roof (`today/src/roof.js`), the roof's unit cases skip, saying so.

Today's own page against a stand-in for the account (`mocks/todaystub.mjs` on :8789, its answers in
`mocks/today/*.json`): `todaypage`, `todayshell` (the tab bar, Apps, You, and the hub not ready: Today on the apps' own
addresses) and `todayphases` (each phase of the demo's day, Monday 2 November 2026 in London, with Playwright's clock
installed at the phase's moment; crossing a boundary redraws with no request). On the real stack through the API:
`todayrules` (acts, Undo, levels) and `ridehold` (a planned ride holding notifications). A clock phase on the real
stack is reached by choosing the account's and the browser's time zone so that now is the hour wanted (`zoneAt`), never
by moving the server's clock.

To aim the kit at another local copy of the site (another worktree on another port, say), set `TEST_BASE`
(`TEST_BASE=http://localhost:8790 node --import ./mapopen.mjs func.mjs <state> <out>`); tests that name port 8788
themselves need it changed in a copy.

Each test prints `PASS`/`FAIL` lines and ends with `FAILS n`; `run.sh` sums them up in
`.state/results.log`, with each test's output in `.state/<test>.log` and its screenshots in
`.state/out/<test>/`. `uitour4.mjs` (not in the suite) is the screen-by-screen UI walk: every
screen and sheet in light and dark at 390 and 320 wide, checked for overlap, clipping and
accessibility (axe).

`wxapp.mjs` is the Weather app's (weather/), at weather.localhost (Chromium finds `*.localhost` by itself), against
made-up Open-Meteo answers for the time it runs (`mocks/wxappdata.mjs`), stand-in radar and map tiles, and its own
stand-in on :8794 for Open-Meteo and the Aviation Weather Center as the server asks them (notifications, airport
reports). It turns notifications on with a push subscription whose keys it holds, runs the tick, and decrypts what
arrives in the push stand-in's box. The app's reasoning has unit tests of its own (`unit/wxinsights.test.mjs`,
`unit/wxnext.test.mjs`).

`fitness.mjs` is Fitness's (fitness/), at fitness.gfg.test (mapped to this machine, as `wxacct.mjs` maps chat. and
weather., so the browser shares the site's sign-in between its addresses), signed in only: signed out, just Sign in
(and its API closed); signed up to Chat, Fitness signed in already; files imported (a Wahoo's FIT, a GPX, a ZWO, a
Garmin Connect zip) and kept with the account; a second browser signing in on the account's page, handed back, with the
first's rides, one opened from its file and exported; a plan and a workout from two browsers at once, both kept; a ride
renamed and one deleted on both; and signing out. It reads what's kept straight from the local D1 (`fx_state`,
`fx_acts`). Its files' unit tests, and the server's checks and the merge, are `unit/fitness.test.mjs`.

Test accounts start as accounts did before Chat's pigeons became a switch: pigeons on, new chats By Pigeon, the
one-time note already seen (`PIGEONS=1`, the kit's default, to `server.sh`). `instant.mjs` restarts the site with the
real default (`PIGEONS=0`: pigeons off, chats instant); a test can also set one account's switch (`joinChat(…,
{ pigeons })`, `madeIn(…, { pigeons })`, the kit's `setPigeons(ph, on)`). Typing dots come from Chat's typing Worker
(`workers/live`), which `server.sh` runs beside the site on :8790 (`TYPING=0`: none, so typing is off).
`STREAK_ANYTIME=1` lets streak warnings go at any hour, and `PULSE_MS` sets the pulse's pace.

`acctjoin.mjs` runs the site as the real one is, new accounts by invite only (`OPEN_SIGNUP=0` to `server.sh`; every
other test has open sign-up), for joining with an invite, a forgotten password and its reset link, and each app's
sign-in.

This folder is part of the repository but not the site: `/.tools/*` is turned away in `_redirects`.

Status-page UI checks can run independently of the Worker:
`CHROMIUM=/usr/bin/chromium node .tools/tests/status-ui.mjs`.
They use isolated fixtures, block external requests, and check both themes from 320 to 1920px,
including healthy/failing states, refresh, period controls, incident disclosure, keyboard focus, sheets,
lookup, section navigation, desktop history expansion and saved theme selection. Set `STATUS_SCREENSHOTS=/tmp/status-ui` for full-page captures.
