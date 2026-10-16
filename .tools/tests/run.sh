#!/bin/bash
# InFlight's end-to-end tests, each against a fresh local copy of the site: `wrangler pages dev`
# on :8788 with an empty database, and stand-ins for Web Push, email, GIPHY, the weather and
# Have I Been Pwned (mocks/). Every test signs people up in real browsers and drives the app.
#
#   cd .tools/tests && npm ci          (once; Chromium: `npx playwright install chromium`, or set CHROMIUM)
#   ./run.sh                           every test in suite.txt
#   ./run.sh followtest lowsev         just these
#
# Results: one line per test in .state/results.log ("FAILS 0" is a pass), each test's output in
# .state/<test>.log and its screenshots in .state/out/<test>/. Needs `127.0.0.1 chat.localhost`
# in /etc/hosts (the app's own address, run locally).
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
S=${STATE:-$HERE/.state}; mkdir -p "$S/out"; ln -sfn "$HERE" "$S/wr"     # (the tests find their kit at $S/wr)
export APP_ROOT=$ROOT
[ -z "${CHROMIUM:-}" ] && [ -x /opt/pw-browsers/chromium ] && export CHROMIUM=/opt/pw-browsers/chromium
grep -q chat.localhost /etc/hosts || echo "note: add '127.0.0.1 chat.localhost' to /etc/hosts"
TESTS=${*:-$(cat "$HERE/suite.txt")}
PIDS=()
cleanup() { "$HERE/server.sh" stop; for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT
export S
# (a test that restarts the site partway, keeping what's in it, runs this)
printf '#!/bin/bash\nS=%q APP_ROOT=%q exec %q keep\n' "$S" "$ROOT" "$HERE/server.sh" > "$S/restartkeep.sh"; chmod +x "$S/restartkeep.sh"
# the stand-ins, once for the whole run (email accepts unless a test says otherwise)
echo ok > "$S/mockmode"
node "$HERE/mocks/pushmock.mjs" "$S/pushbox.jsonl" >/dev/null 2>&1 & PIDS+=($!)
node "$HERE/mocks/mailmock2.mjs" "$S/mailbox.jsonl" "$S/mockmode" >/dev/null 2>&1 & PIDS+=($!)
node "$HERE/mocks/giphymock.mjs" "$HERE/mocks/giphy" "$S/giphylog.jsonl" >/dev/null 2>&1 & PIDS+=($!)
node "$HERE/mocks/weathermock.mjs" "$S/weatherlog.jsonl" >/dev/null 2>&1 & PIDS+=($!)
node "$HERE/mocks/pwnedmock.mjs" "$S/pwnedlog.jsonl" >/dev/null 2>&1 & PIDS+=($!)
: > "$S/results.log"; bad=0
for t in $TESTS; do
  "$HERE/server.sh" fresh; mkdir -p "$S/out/$t"
  (cd "$HERE" && timeout 900 node --import ./mapopen.mjs "$t.mjs" "$S" "$S/out/$t" > "$S/$t.log" 2>&1)
  n=$(grep -E '^FAILS' "$S/$t.log" | tail -1 | awk '{print $2}')
  echo "$t: FAILS ${n:-crashed}" | tee -a "$S/results.log"
  [ "${n:-1}" = "0" ] || { bad=$((bad + 1)); grep -E '^FAIL |Error' "$S/$t.log" | head -4 | cut -c1-240; }
done
echo "$bad of $(echo $TESTS | wc -w) failed" | tee -a "$S/results.log"
[ $bad -eq 0 ]
