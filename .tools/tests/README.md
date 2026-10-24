# InFlight's tests

**Unit tests** (`unit/`, Node's own test runner, no dependencies): the space maths and lunar
eclipses (against real eclipses, to the minute), pigeons following someone between worlds, and
public-key checks. They run on every push (`.github/workflows/tests.yml`), along with a check that
every file parses.

    node --test .tools/tests/unit/*.test.mjs

**End-to-end tests** (everything else here): real browsers (Playwright) drive the app against a
fresh local copy of the site for each test (`wrangler pages dev` on :8788, an empty database),
with stand-ins for Web Push, email, GIPHY, the weather and Have I Been Pwned (`mocks/`). People
make accounts and sign in (from the app, on the account's page, and back, as everyone does now: `join.mjs`; a test
that drives InFlight's API directly signs in the same way, `handback.mjs`), add friends, send pigeons, and the tests
check what lands, what's drawn and what's pushed.

    cd .tools/tests && npm ci
    npx playwright install chromium          # or point CHROMIUM at a Chromium you have
    echo "127.0.0.1 chat.localhost" | sudo tee -a /etc/hosts
    ./run.sh                                 # every test in suite.txt (about 1½ hours)
    ./run.sh followtest lowsev               # just these

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

`acctjoin.mjs` runs the site as the real one is, new accounts by invite only (`OPEN_SIGNUP=0` to `server.sh`; every
other test has open sign-up), for joining with an invite, a forgotten password and its reset link, and each app's
sign-in.

This folder is part of the repository but not the site: `/.tools/*` is turned away in `_redirects`.
