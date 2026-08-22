#!/usr/bin/env bash
# Every suite. Run before committing.
set -uo pipefail
cd "$(dirname "$0")"
FAIL=0
run() {
  printf '\n\033[1m── %s\033[0m\n' "$1"; shift
  "$@" || FAIL=1
}
# The hunts need a clean database; they mutate deliberately.
rm -f blokk.db blokk.db-wal blokk.db-shm
python3 seed.py >/dev/null

# blokk.conf is NOT deleted — it is yours, and it may be a real setup. But it
# decides what the suites run against: with a model server configured and not
# running, every workflow fails on an unreachable endpoint and probes that
# expect a run to finish report a defect that is not there. Cost me an hour.
if [ -f blokk.conf ] && ! grep -q '^MODE=stubs' blokk.conf; then
  printf '\033[33m  note: blokk.conf is configured for a model server.\033[0m\n'
  printf '  The suites will use it. If it is not running they will fail on that,\n'
  printf '  not on the code. ./blokk doctor says which.\n'
fi

run "server: adversarial"   python3 demo/hunt.py
run "front end: adversarial" node demo/hunt_ui.js
run "API contract"          node demo/contract.js
run "engine journeys"       node demo/journey.js
run "unit"                  node demo/test.js
run "python parses"         python3 -m compileall -q core api flows

printf '\n'
if [ "$FAIL" = "0" ]; then printf '\033[32m  all suites green\033[0m\n\n'; else
  printf '\033[31m  FAILURES above\033[0m\n\n'; fi
exit $FAIL
