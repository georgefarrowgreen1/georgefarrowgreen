#!/bin/bash
# Chat's end-to-end tests, each against a fresh local copy of the site: `wrangler dev -c wrangler.worker.jsonc`
# on :8788 with an empty database, and stand-ins for Web Push, email, GIPHY, the weather and
# Have I Been Pwned (mocks/). Every test makes accounts in real browsers and drives the apps.
#
#   cd .tools/tests && npm ci          (once; Chromium: `npx playwright install chromium`, or set CHROMIUM)
#   ./run.sh                           every test in suite.txt
#   ./run.sh followtest lowsev         just these
#
# Results: one line per test in .state/results.log ("FAILS 0" is a pass), each test's output in
# .state/<test>.log and its screenshots in .state/out/<test>/. Needs `127.0.0.1 chat.localhost`
# in /etc/hosts (the app's own address, run locally).
# A test whose first line is `// needs: hub` runs with InFlite's hub beside the site (hubstack.mjs: the inflite repo's
# Worker on :8787 and the apps' host pass-throughs; `// needs: hub mail` adds Mail's Worker), which needs the inflite
# repo beside this one; without it the test isn't run, and its line says SKIPPED (never a pass).
set -u
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
S=${STATE:-$HERE/.state}; mkdir -p "$S/out"; ln -sfn "$HERE" "$S/wr"     # (the tests find their kit at $S/wr)
export APP_ROOT=$ROOT
[ -z "${CHROMIUM:-}" ] && [ -x /opt/pw-browsers/chromium ] && export CHROMIUM=/opt/pw-browsers/chromium
grep -q chat.localhost /etc/hosts || { echo "127.0.0.1 chat.localhost" >> /etc/hosts; } 2>/dev/null || echo "note: add '127.0.0.1 chat.localhost' to /etc/hosts"
TESTS=${*:-$(cat "$HERE/suite.txt")}
PIDS=(); HUB=
hubstop() { [ -n "$HUB" ] && { kill "$HUB" 2>/dev/null; wait "$HUB" 2>/dev/null; HUB=; }; }
cleanup() { hubstop; "$HERE/server.sh" stop; for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
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
node "$HERE/mocks/marketsmock.mjs" "$S/marketslog.jsonl" >/dev/null 2>&1 & PIDS+=($!)
: > "$S/results.log"; bad=0; skipped=0
for t in $TESTS; do
  # (what the test needs beside the site, from its first line: `// needs: hub`, `// needs: hub mail`)
  needs=$(head -1 "$HERE/$t.mjs" 2>/dev/null | sed -n 's|^// needs: *||p')
  if [ -n "$needs" ] && [ ! -f "$ROOT/../inflite/today/src/hub.js" ]; then
    echo "$t: SKIPPED (no inflite repo beside)" | tee -a "$S/results.log"; skipped=$((skipped + 1)); continue
  fi
  "$HERE/server.sh" fresh; mkdir -p "$S/out/$t"
  if [ -n "$needs" ]; then
    rm -f "$S/hubstack.up"; node "$HERE/hubstack.mjs" "$S" $needs > "$S/hubstack.log" 2>&1 & HUB=$!
    for i in $(seq 1 150); do [ -f "$S/hubstack.up" ] && break; kill -0 "$HUB" 2>/dev/null || break; sleep 1; done
    [ -f "$S/hubstack.up" ] || { echo "$t: FAILS hub-not-up" | tee -a "$S/results.log"; bad=$((bad + 1)); tail -5 "$S/hubstack.log"; hubstop; continue; }
  fi
  (cd "$HERE" && timeout 900 node --import ./mapopen.mjs "$t.mjs" "$S" "$S/out/$t" > "$S/$t.log" 2>&1)
  hubstop
  n=$(grep -E '^FAILS' "$S/$t.log" | tail -1 | awk '{print $2}')
  echo "$t: FAILS ${n:-crashed}" | tee -a "$S/results.log"
  [ "${n:-1}" = "0" ] || { bad=$((bad + 1)); grep -E '^FAIL |Error' "$S/$t.log" | head -4 | cut -c1-240; }
done
summary="$bad of $(echo $TESTS | wc -w) failed"; [ $skipped -gt 0 ] && summary="$summary, $skipped skipped (not passes)"
echo "$summary" | tee -a "$S/results.log"
[ $bad -eq 0 ] && [ $skipped -eq 0 ]
