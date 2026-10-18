# InFlight's tests

**Unit tests** (`unit/`, Node's own test runner, no dependencies): the space maths and lunar
eclipses (against real eclipses, to the minute), pigeons following someone between worlds, and
public-key checks. They run on every push (`.github/workflows/tests.yml`), along with a check that
every file parses.

    node --test .tools/tests/unit/*.test.mjs

**End-to-end tests** (everything else here): real browsers (Playwright) drive the app against a
fresh local copy of the site for each test (`wrangler pages dev` on :8788, an empty database),
with stand-ins for Web Push, email, GIPHY, the weather and Have I Been Pwned (`mocks/`). People
sign up, add friends, send pigeons, and the tests check what lands, what's drawn and what's pushed.

    cd .tools/tests && npm ci
    npx playwright install chromium          # or point CHROMIUM at a Chromium you have
    echo "127.0.0.1 chat.localhost" | sudo tee -a /etc/hosts
    ./run.sh                                 # every test in suite.txt (about 1½ hours)
    ./run.sh followtest lowsev               # just these

Each test prints `PASS`/`FAIL` lines and ends with `FAILS n`; `run.sh` sums them up in
`.state/results.log`, with each test's output in `.state/<test>.log` and its screenshots in
`.state/out/<test>/`. `uitour4.mjs` (not in the suite) is the screen-by-screen UI walk: every
screen and sheet in light and dark at 390 and 320 wide, checked for overlap, clipping and
accessibility (axe).

`wxapp.mjs` is the Weather app's (weather/), at weather.localhost (Chromium finds `*.localhost` by itself), against
made-up Open-Meteo answers for the time it runs (`mocks/wxappdata.mjs`); its reasoning has unit tests of its own
(`unit/wxinsights.test.mjs`).

This folder is part of the repository but not the site: `/.tools/*` is turned away in `_redirects`.
